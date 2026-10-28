const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const zlib = require('node:zlib')
const { test } = require('node:test')
const { createCanvas } = require('canvas')
const { readPalette, indexPixels, build, checkResource, checkInputs } = require('./resources')

// Independent indexed-PNG reader checks PLTE order and unfiltered index bytes.
function decodeIndexed(png) {
  assert.equal(png[24], 8)
  assert.equal(png[25], 3)
  const width = png.readUInt32BE(16), height = png.readUInt32BE(20)
  const chunks = {}
  for (let p = 8; p < png.length;) {
    const length = png.readUInt32BE(p), type = png.toString('ascii', p + 4, p + 8)
    ;(chunks[type] ||= []).push(png.subarray(p + 8, p + 8 + length))
    p += length + 12
  }
  const raw = zlib.inflateSync(Buffer.concat(chunks.IDAT))
  assert.equal(raw.length, (width + 1) * height)
  const pixels = Buffer.alloc(width * height)
  function paeth(a, b, c) {
    const p = a + b - c, da = Math.abs(p - a), db = Math.abs(p - b), dc = Math.abs(p - c)
    return da <= db && da <= dc ? a : db <= dc ? b : c
  }
  for (let y = 0; y < height; y++) {
    const filter = raw[y * (width + 1)]
    assert.ok(filter <= 4)
    for (let x = 0; x < width; x++) {
      const pos = y * width + x
      const a = x ? pixels[pos - 1] : 0, b = y ? pixels[pos - width] : 0, c = x && y ? pixels[pos - width - 1] : 0
      const predictor = [0, a, b, Math.floor((a + b) / 2), paeth(a, b, c)][filter]
      pixels[pos] = raw[y * (width + 1) + x + 1] + predictor
    }
  }
  return { width, height, palette: Buffer.concat(chunks.PLTE), transparency: Buffer.concat(chunks.tRNS), pixels }
}

test('ACT length, color count and transparency metadata are validated', () => {
  const act = Buffer.alloc(768)
  assert.equal(readPalette(act).length, 768)
  assert.throws(() => readPalette(Buffer.alloc(769)), /768/)
  const extended = Buffer.concat([act, Buffer.from([1, 0, 0, 0])])
  assert.deepEqual(readPalette(extended), act)
  extended.writeUInt16BE(65535, 770)
  assert.deepEqual(readPalette(extended), act)
  extended.writeUInt16BE(0, 768)
  assert.deepEqual(readPalette(extended), act)
  extended.writeUInt16BE(3, 770)
  assert.throws(() => readPalette(extended), /transparent index 0/)
  extended.writeUInt16BE(0, 770)
  extended.writeUInt16BE(128, 768)
  assert.throws(() => readPalette(extended), /256/)
})

test('fixed RGB mapping preserves indices, transparency, ties and rejects partial alpha', () => {
  const palette = Buffer.alloc(768, 255)
  palette.set([255, 0, 255], 0)
  palette.set([0, 0, 0], 3)
  palette.set([10, 0, 0], 6)
  palette.set([0, 0, 0], 9)
  assert.deepEqual(indexPixels(Buffer.from([
    255, 6, 253, 255, 0, 0, 0, 255, 10, 0, 0, 255, 5, 0, 0, 255, 1, 2, 3, 0,
  ]), palette), Buffer.from([0, 1, 2, 1, 0]))
  assert.throws(() => indexPixels(Buffer.from([1, 2, 3, 127]), palette), /Partial alpha/)
})

function makeResource(dir, name, names, width, height) {
  const sourceDir = path.join(dir, name)
  fs.mkdirSync(sourceDir)
  const palette = Buffer.alloc(768)
  for (let i = 0; i < 256; i++) palette.set([i, 255 - i, i ^ 85], i * 3)
  fs.writeFileSync(path.join(sourceDir, `${name}.act`), palette)
  const expected = []
  for (let frame = 0; frame < names.length; frame++) {
    const c = createCanvas(width, height), ctx = c.getContext('2d')
    const image = ctx.createImageData(width, height)
    const indices = Buffer.alloc(width * height)
    for (let p = 0; p < indices.length; p++) {
      const i = (p + frame * 31) % 256
      indices[p] = i
      image.data.set([...palette.subarray(i * 3, i * 3 + 3), 255], p * 4)
    }
    expected.push(indices)
    ctx.putImageData(image, 0, 0)
    fs.writeFileSync(path.join(sourceDir, names[frame]), c.toBuffer('image/png'))
  }
  return { sourceDir, expected, palette }
}

test('single/multiple frames, numeric order, fixed PLTE, deterministic PNG and SHP round trip', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'shp-test-'))
  try {
    const sourceDir = path.join(dir, 'shp')
    fs.mkdirSync(sourceDir)
    const ra2 = path.join(sourceDir, 'ra2'), yr = path.join(sourceDir, 'yr')
    fs.mkdirSync(ra2); fs.mkdirSync(yr)
    const options = { sourceDir, outputDir: path.join(dir, 'out'), packageDirs: { ra2: path.join(dir, 'stage/language'), yr: path.join(dir, 'stage/langmd') } }
    const { expected, palette } = makeResource(ra2, 'grfxtxt', ['0000.png', '0001.png', '0002.png', '0003.png'], 436, 112)
    makeResource(ra2, 'single', ['0.png'], 3, 2)
    makeResource(yr, 'single', ['0.png', '1.png'], 3, 2)
    makeResource(ra2, 'numeric', ['10.png', '2.png', '1.png'], 3, 2)
    fs.mkdirSync(options.packageDirs.yr, { recursive: true })
    fs.writeFileSync(path.join(options.packageDirs.yr, 'legacy.shp'), 'staged YR resource stays unchanged')
    fs.writeFileSync(path.join(sourceDir, 'legacy.shp'), 'legacy stays unchanged')
    fs.writeFileSync(path.join(sourceDir, 'grfxtxt.shp'), 'old version stays unchanged')
    const first = await build(options), second = await build(options)
    assert.equal(first.length, 4)
    assert.deepEqual(first.map(r => r.png), second.map(r => r.png))
    assert.deepEqual(first.map(r => r.shp), second.map(r => r.shp))
    const resource = first.find(r => r.name === 'grfxtxt')
    const decoded = decodeIndexed(resource.png)
    assert.equal(decoded.width, 436)
    assert.equal(decoded.height, 448)
    assert.deepEqual(decoded.palette, palette)
    assert.equal(decoded.transparency[0], 0)
    assert.ok(decoded.transparency.subarray(1).every(a => a === 255))
    assert.deepEqual(decoded.pixels, Buffer.concat(expected))
    assert.equal(resource.shp.length, 195432)
    for (const r of first) {
      const png = decodeIndexed(r.png)
      assert.deepEqual(png.pixels, Buffer.concat(r.frames))
      assert.deepEqual(png.palette, r.palette)
      assert.equal(r.shp.readUInt16LE(2), r.width)
      assert.equal(r.shp.readUInt16LE(4), r.height)
      assert.equal(r.shp.readUInt16LE(6), r.frames.length)
      for (let i = 0; i < r.frames.length; i++) {
        const header = 8 + i * 24
        assert.equal(r.shp.readUInt16LE(header), 0)
        assert.equal(r.shp.readUInt16LE(header + 2), 0)
        assert.equal(r.shp.readUInt16LE(header + 4), r.width)
        assert.equal(r.shp.readUInt16LE(header + 6), r.height)
        assert.equal(r.shp.readUInt32LE(header + 8), 1)
        const offset = r.shp.readUInt32LE(header + 20)
        assert.deepEqual(r.shp.subarray(offset, offset + r.width * r.height), r.frames[i])
      }
    }
    assert.equal(first.find(r => r.name === 'single' && r.target === 'ra2').frames.length, 1)
    assert.equal(first.find(r => r.name === 'single' && r.target === 'yr').frames.length, 2)
    const sorted = checkResource(path.join(ra2, 'numeric'))
    assert.deepEqual(sorted.frames, ['1.png', '2.png', '10.png'])
    assert.deepEqual(first.find(r => r.name === 'numeric').frames.map(f => f[0]), [62, 31, 0])
    assert.deepEqual(fs.readFileSync(path.join(options.packageDirs.ra2, 'grfxtxt.shp')), resource.shp)
    assert.equal(fs.readFileSync(path.join(sourceDir, 'grfxtxt.shp'), 'utf8'), 'old version stays unchanged')
    assert.equal(fs.readFileSync(path.join(options.packageDirs.yr, 'legacy.shp'), 'utf8'), 'staged YR resource stays unchanged')
    assert.ok(!fs.existsSync(path.join(options.packageDirs.ra2, 'legacy.shp')))
    assert.ok(!fs.existsSync(path.join(options.packageDirs.yr, 'grfxtxt.shp')))
    for (const target of ['ra2', 'yr']) {
      const single = first.find(r => r.name === 'single' && r.target === target)
      assert.deepEqual(fs.readFileSync(path.join(options.packageDirs[target], 'single.shp')), single.shp)
      assert.deepEqual(fs.readFileSync(path.join(options.outputDir, target, 'single.shp')), single.shp)
    }
    assert.notDeepEqual(fs.readFileSync(path.join(options.packageDirs.ra2, 'single.shp')), fs.readFileSync(path.join(options.packageDirs.yr, 'single.shp')))
    const wrong = createCanvas(1, 1)
    fs.writeFileSync(path.join(ra2, 'grfxtxt/0001.png'), wrong.toBuffer('image/png'))
    assert.throws(() => checkInputs(options), /expected 436x112/)
    await assert.rejects(build(options), /expected 436x112/)
    assert.deepEqual(fs.readFileSync(path.join(options.packageDirs.ra2, 'grfxtxt.shp')), resource.shp)
  } finally { fs.rmSync(dir, { recursive: true, force: true }) }
})

test('missing inputs, invalid names, duplicate numbers, corrupt PNGs and indexed sources fail clearly', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'shp-invalid-'))
  try {
    fs.mkdirSync(path.join(dir, 'ra2')); fs.mkdirSync(path.join(dir, 'yr'))
    assert.throws(() => checkInputs({ sourceDir: dir }), /No SHP resources/)
    const r = makeResource(path.join(dir, 'ra2'), 'sample', ['0.png'], 3, 2)
    const palettePath = path.join(r.sourceDir, 'sample.act')
    const palette = fs.readFileSync(palettePath)
    fs.unlinkSync(palettePath)
    assert.throws(() => checkResource(r.sourceDir), /Missing palette/)
    fs.writeFileSync(palettePath, palette)
    fs.copyFileSync(path.join(r.sourceDir, '0.png'), path.join(r.sourceDir, '00.png'))
    assert.throws(() => checkResource(r.sourceDir), /duplicate frame/)
    fs.unlinkSync(path.join(r.sourceDir, '00.png'))
    fs.renameSync(path.join(r.sourceDir, '0.png'), path.join(r.sourceDir, 'title.png'))
    assert.throws(() => checkResource(r.sourceDir), /invalid or duplicate frame/)
    fs.renameSync(path.join(r.sourceDir, 'title.png'), path.join(r.sourceDir, '0.png'))
    const png = fs.readFileSync(path.join(r.sourceDir, '0.png'))
    const badType = Buffer.from(png); badType[25] = 3
    fs.writeFileSync(path.join(r.sourceDir, '0.png'), badType)
    assert.throws(() => checkResource(r.sourceDir), /RGB/)
    fs.writeFileSync(path.join(r.sourceDir, '0.png'), 'corrupt')
    assert.throws(() => checkResource(r.sourceDir), /Invalid PNG/)
    fs.unlinkSync(path.join(r.sourceDir, '0.png'))
    assert.throws(() => checkResource(r.sourceDir), /missing numbered PNG/)
    fs.writeFileSync(path.join(dir, 'direct.png'), png)
    assert.throws(() => checkInputs({ sourceDir: dir }), /not directly in shp/)
  } finally { fs.rmSync(dir, { recursive: true, force: true }) }
})

module.exports = { decodeIndexed }
