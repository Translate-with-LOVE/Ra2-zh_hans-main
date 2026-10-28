const fs = require('node:fs')
const path = require('node:path')

const root = path.resolve(__dirname, '../../..')
const config = {
  sourceDir: path.join(root, 'shp'),
  outputDir: path.join(root, 'pack/shp'),
  packageDirs: {
    ra2: path.join(root, '_src_files/language'),
    yr: path.join(root, '_src_files/langmd'),
  },
}

function readPalette(data) {
  if (data.length !== 768 && data.length !== 772) {
    throw new Error('ACT must contain 768 RGB bytes, optionally followed by 4 metadata bytes')
  }
  if (data.length === 772) {
    const count = data.readUInt16BE(768) || 256
    const transparent = data.readUInt16BE(770)
    if (count !== 256 || (transparent !== 0 && transparent !== 65535)) {
      throw new Error('SHP requires 256 ACT entries and transparent index 0 (or unspecified)')
    }
  }
  return data.subarray(0, 768)
}

function checkResource(sourceDir) {
  const name = path.basename(sourceDir)
  const files = fs.readdirSync(sourceDir, { withFileTypes: true }).filter(f => f.isFile()).map(f => f.name)
  const pngs = files.filter(file => /\.png$/i.test(file))
  const paletteFile = path.join(sourceDir, `${name}.act`)
  const missing = []
  if (!pngs.length) missing.push('missing numbered PNG frames (e.g. 0000.png)')
  if (!fs.existsSync(paletteFile)) missing.push(`Missing palette: ${paletteFile}`)
  if (missing.length) throw new Error(`${sourceDir}: ${missing.join('; ')}. Old SHP files are never a fallback for source directories.`)
  const numbers = new Set()
  for (const file of pngs) {
    const number = Number(path.basename(file, path.extname(file)))
    if (!/^\d+\.png$/i.test(file) || !Number.isSafeInteger(number) || numbers.has(number)) {
      throw new Error(`${sourceDir}: invalid or duplicate frame number: ${file}`)
    }
    numbers.add(number)
  }
  const frames = pngs.sort((a, b) => Number(a.split('.')[0]) - Number(b.split('.')[0]))
  if (frames.length > 65535) throw new Error(`${name}: too many SHP frames`)
  const palette = readPalette(fs.readFileSync(paletteFile))
  let width, height
  for (const frame of frames) {
    const file = path.join(sourceDir, frame)
    const png = fs.readFileSync(file)
    if (png.length < 33 || !png.subarray(0, 8).equals(Buffer.from('89504e470d0a1a0a', 'hex')) ||
        png.toString('ascii', 12, 16) !== 'IHDR') throw new Error(`Invalid PNG: ${file}`)
    width ??= png.readUInt32BE(16)
    height ??= png.readUInt32BE(20)
    if (!width || !height || width > 32767 || height * frames.length > 32767) {
      throw new Error(`${name}: dimensions exceed the indexed PNG canvas limit (32767)`)
    }
    if (png.readUInt32BE(16) !== width || png.readUInt32BE(20) !== height) {
      throw new Error(`${file}: expected ${width}x${height}; all frames must have the same dimensions; images are never resized`)
    }
    if (png[24] !== 8 || ![2, 6].includes(png[25])) {
      throw new Error(`${file}: expected 8-bit RGB (24-bit) or RGBA PNG`)
    }
  }
  return { name, sourceDir, paletteFile, frames, width, height, palette }
}

function checkInputs(options = config) {
  const entries = fs.readdirSync(options.sourceDir, { withFileTypes: true })
  const unexpected = entries.filter(f => (f.isDirectory() && !['ra2', 'yr'].includes(f.name)) || /\.(png|act)$/i.test(f.name))
  if (unexpected.length) throw new Error(`Use shp/ra2/<resource>/ or shp/yr/<resource>/, not directly in shp/: ${unexpected.map(f => f.name).join(', ')}`)
  const resources = []
  for (const target of ['ra2', 'yr']) {
    const dir = path.join(options.sourceDir, target)
    if (!fs.existsSync(dir)) throw new Error(`Missing SHP target directory: ${dir}`)
    const files = fs.readdirSync(dir, { withFileTypes: true })
    const loose = files.filter(f => f.isFile() && /\.(png|act|shp)$/i.test(f.name))
    if (loose.length) throw new Error(`${dir}: place numbered PNGs and ACT inside a resource subdirectory: ${loose.map(f => f.name).join(', ')}`)
    for (const file of files.filter(f => f.isDirectory()).sort((a, b) => a.name.localeCompare(b.name))) {
      resources.push({ ...checkResource(path.join(dir, file.name)), target })
    }
  }
  if (!resources.length) throw new Error(`No SHP resources in ${options.sourceDir}/ra2 or yr`)
  return resources
}

function indexPixels(rgba, palette) {
  const indexed = Buffer.alloc(rgba.length / 4)
  const cache = new Map()
  for (let p = 0; p < indexed.length; p++) {
    const [r, g, b, a] = rgba.subarray(p * 4, p * 4 + 4)
    if (a === 0) continue
    if (a !== 255) throw new Error(`Partial alpha ${a} at pixel ${p}; flatten the source explicitly before building`)
    const key = (r << 16) | (g << 8) | b
    let index = cache.get(key)
    if (index === undefined) {
      let distance = Infinity
      // Fixed-palette squared RGB distance, no dithering. Ties use the first index.
      // Index 0 participates so magenta backgrounds (including near-magenta) stay transparent.
      for (let i = 0; i < 256; i++) {
        const d = (r - palette[i * 3]) ** 2 + (g - palette[i * 3 + 1]) ** 2 + (b - palette[i * 3 + 2]) ** 2
        if (d < distance) { distance = d; index = i }
      }
      cache.set(key, index)
    }
    indexed[p] = index
  }
  return indexed
}

function indexedPng(indices, width, height, palette) {
  const { createCanvas } = require('canvas')
  const canvas = createCanvas(width, height)
  const ctx = canvas.getContext('2d', { pixelFormat: 'A8' })
  const image = ctx.createImageData(width, height)
  image.data.set(indices)
  ctx.putImageData(image, 0, 0)
  const rgbaPalette = new Uint8ClampedArray(256 * 4)
  for (let i = 0; i < 256; i++) {
    rgbaPalette.set(palette.subarray(i * 3, i * 3 + 3), i * 4)
    rgbaPalette[i * 4 + 3] = i === 0 ? 0 : 255
  }
  return canvas.toBuffer('image/png', { palette: rgbaPalette, backgroundIndex: 0 })
}

function shpBuffer(frames, width, height) {
  // Same uncompressed TS/RA2 SHP headers as index.js and the original grfxtxt.shp.
  const headerSize = 8 + frames.length * 24
  const shp = Buffer.alloc(headerSize + frames.length * width * height)
  shp.writeUInt16LE(width, 2)
  shp.writeUInt16LE(height, 4)
  shp.writeUInt16LE(frames.length, 6)
  frames.forEach((pixels, i) => {
    const header = 8 + i * 24
    const offset = headerSize + i * width * height
    shp.writeUInt16LE(width, header + 4)
    shp.writeUInt16LE(height, header + 6)
    shp.writeUInt32LE(1, header + 8)
    shp.writeUInt32LE(offset, header + 20)
    pixels.copy(shp, offset)
  })
  return shp
}

async function buildResource(resource) {
  const { sourceDir, frames: names, width, height, palette } = resource
  const { createCanvas, loadImage } = require('canvas')
  const frames = []
  for (const name of names) {
    const canvas = createCanvas(width, height)
    const ctx = canvas.getContext('2d')
    ctx.drawImage(await loadImage(path.join(sourceDir, name)), 0, 0)
    try {
      frames.push(indexPixels(ctx.getImageData(0, 0, width, height).data, palette))
    } catch (error) { throw new Error(`${name}: ${error.message}`) }
  }
  // Convert each frame first; concatenate index bytes, never draw indexed frames onto RGBA.
  const pixels = Buffer.concat(frames)
  const png = indexedPng(pixels, width, height * frames.length, palette)
  const shp = shpBuffer(frames, width, height)
  return { ...resource, frames, png, shp }
}

async function build(options = config) {
  const resources = checkInputs(options)
  const generated = []
  // Finish validation/conversion before copying anything into the package staging directory.
  for (const resource of resources) generated.push(await buildResource(resource))
  for (const resource of generated) {
    const outputDir = path.join(options.outputDir, resource.target)
    const packageDir = options.packageDirs[resource.target]
    fs.mkdirSync(outputDir, { recursive: true })
    fs.mkdirSync(packageDir, { recursive: true })
    fs.writeFileSync(path.join(outputDir, `${resource.name}.png`), resource.png)
    fs.writeFileSync(path.join(outputDir, `${resource.name}.shp`), resource.shp)
    fs.writeFileSync(path.join(packageDir, `${resource.name}.shp`), resource.shp)
    console.log(`${resource.target}/${resource.name}: ${resource.frames.length} frame(s) ${resource.width}x${resource.height}, vertical indexed PNG + SHP -> ${outputDir}`)
  }
  return generated
}

module.exports = { config, readPalette, checkResource, checkInputs, indexPixels, indexedPng, shpBuffer, buildResource, build }
if (require.main === module) {
  const args = process.argv.slice(2)
  if (args.length && (args.length !== 1 || args[0] !== '--check-inputs')) {
    console.error('Usage: node resources.js [--check-inputs]')
    process.exitCode = 1
  } else {
    Promise.resolve().then(() => args.length ? checkInputs() : build()).catch(error => {
      console.error(error.message)
      process.exitCode = 1
    })
  }
}
