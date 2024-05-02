//代码基于 New Bing 生成修改

//引入fs模块，用于读取文件
const fs = require('fs')
const { createCanvas, loadImage } = require('canvas')
const { deltaE } = require('color-delta-e')
const BDF = require('bdfjs')
const path = require('path')

const rootDir = path.resolve('../../../')

const rainbowSheet = {}

const fontFileName_ch = 'zpix-9.bdf'
const fontFileName_en = 'zpix-8.bdf'
/** @type {{ch:BDF.Font,en:BDF.Font}} */
const fonts = {
  ch: BDF.parse(fs.readFileSync(fontFileName_ch).toString('utf-8')),
  en: BDF.parse(fs.readFileSync(fontFileName_en).toString('utf-8')),
}

/** @type {{[x:string]:string}} */
const fileTitleMap = {}

const titleMapFile = fs
  .readFileSync(path.join(rootDir, '/cameo', '/titleMap.csv'))
  .toString('utf-8')
titleMapFile.split('\n').forEach((line) => {
  const lineArray = line.split(',')
  fileTitleMap[lineArray[0]] = lineArray[1]
})

/**
 * 定义一个lambda函数，接受一个act文件的路径作为参数，返回颜色表
 * @param {string} file 文件名
 */
const parseACT = (file) => {
  //创建一个空数组，用于存储颜色值
  let colors = []
  //以Hex方式读取文件
  const data = fs.readFileSync(file)
  //遍历每个字节，每三个字节代表一个颜色值（RGB）
  //向色盘推送第一个颜色
  colors.push([data[0], data[1], data[2]])
  //起始值为3，用于跳过透明通道
  for (let i = 3; i < data.byteLength; i += 3) {
    //获取当前字节
    let r = data[i]
    let g = data[i + 1]
    let b = data[i + 2]
    //添加颜色到彩虹表中
    rainbowSheet[(r << 16) | (g << 8) | b] = i / 3
    //拼接成一个完整的颜色值，[r,g,b]
    let color = [r, g, b]
    //将颜色值添加到数组中
    colors.push(color)
  }
  return colors
}

const actRGB = parseACT('cameo.act')

const canvas = createCanvas(60, 48)
const ctx = canvas.getContext('2d', { willReadFrequently: true })
const canvasForText = createCanvas(1024, 48)
const textCtx = canvasForText.getContext('2d', {
  willReadFrequently: true,
})
const canvasForTextTop = createCanvas(1024, 48)
const textCtxTop = canvasForTextTop.getContext('2d', {
  willReadFrequently: true,
})

/** @type {number[]} */
let textLineTotalWidth = []
const lineHeight = 9
/** @type {string[]} */
let titleLines = []

const colorMap = {
  0: '#FFFFFF',
  1: '#FFFFFF',
  2: '#FFFFFF',
  3: '#FFFFFF',
  4: '#f4f4f4',
  5: '#d4d4d4',
  6: '#acacac',
  7: '#a4a4a4',
}

const getShpBin = async (fileName) => {
  ctx.clearRect(0, 0, 60, 48)
  textCtx.clearRect(0, 0, 1024, 48)
  textCtxTop.clearRect(0, 0, 1024, 48)

  const basename = path.basename(fileName, path.extname(fileName))
  let printTitle = false
  if (fileTitleMap[basename]) {
    printTitle = true
    titleLines = fileTitleMap[basename]
      .split('\n')
      .map((name) => name.split('\r')[0])
    textLineTotalWidth = new Array(titleLines.length).fill(0)

    // 逐行绘制文字
    titleLines.forEach((line, lineIndex) => {
      Array.prototype.forEach.call(line, (unitChar, index) => {
        textCtx.fillStyle = '#000000'
        // textCtx.clearRect(0, 0, 8, 8)
        // textCtx.fillText(unitChar, 0, 7)
        const unicode = unitChar.charCodeAt(0)
        /** @type {BDF.Font} */
        let font
        if (unicode <= 0x80) {
          font = fonts.en
        } else {
          font = fonts.ch
        }

        const bitmap = BDF.draw(font, unitChar)
        const width = bitmap.width
        const height = bitmap.height
        // console.log(bitmap)

        const textImgData = textCtx.createImageData(10, 10)
        for (let y = 0; y < height; y++) {
          const row = bitmap[y]
          for (let x = 0; x < width; x++) {
            const pix = row[x]
            textImgData.data[(y * 10 + x) * 4] = 0
            textImgData.data[(y * 10 + x) * 4 + 1] = 0
            textImgData.data[(y * 10 + x) * 4 + 2] = 0
            if (pix == 1) {
              textImgData.data[(y * 10 + x) * 4 + 3] = 255
            } else {
              textImgData.data[(y * 10 + x) * 4 + 3] = 0
            }
          }
        }

        textCtx.putImageData(
          textImgData,
          textLineTotalWidth[lineIndex],
          lineIndex * lineHeight
        )

        textLineTotalWidth[lineIndex] += width

        if (index < line.length - 1) {
          if (unicode <= 0x80) {
            textLineTotalWidth[lineIndex] += 2
          } else {
            if (line.length == 2) {
              textLineTotalWidth[lineIndex] += 4
            } else {
              textLineTotalWidth[lineIndex] += 1
            }
          }
          if (line.length >= 6) {
            textLineTotalWidth[lineIndex] -= 1
          }
        }
      })
    })

    //然后绘制白色字
    for (let y = 0; y < Math.min(lineHeight * titleLines.length - 1, 48); y++) {
      textCtxTop.fillStyle =
        colorMap[y - lineHeight * titleLines.length + lineHeight] || colorMap[0]
      for (let x = 0; x < Math.max(...textLineTotalWidth); x++) {
        const [r, g, b, a] = textCtx.getImageData(x, y, 1, 1).data
        if (a === 255) {
          textCtxTop.fillRect(x, y, 1, 1)
        }
      }
    }
  }
  /**
   * @type {[r:number,g:number,b:number][]}
   */
  const imgRGB = await loadImage(fileName).then((image) => {
    ctx.drawImage(image, 0, 0, 60, 48)
    if (printTitle) {
      // 绘制文字
      const startY = 48 - titleLines.length * lineHeight
      for (let i = 0; i < titleLines.length; i++) {
        // 画文字阴影
        ctx.drawImage(
          canvasForText,
          0,
          i * lineHeight,
          1024,
          lineHeight,
          Math.ceil(30 - textLineTotalWidth[i] / 2) + 1,
          startY + i * lineHeight,
          1024,
          lineHeight
        )

        // 画文字渐变色
        ctx.drawImage(
          canvasForTextTop,
          0,
          i * lineHeight,
          1024,
          lineHeight,
          Math.ceil(30 - textLineTotalWidth[i] / 2),
          startY + i * lineHeight,
          1024,
          lineHeight
        )
      }
    }
    const imgData = ctx.getImageData(0, 0, 60, 48)
    const imgDataRGB = []
    for (let i = 0; i < imgData.data.length; i += 4) {
      //获取当前字节
      let r = imgData.data[i]
      let g = imgData.data[i + 1]
      let b = imgData.data[i + 2]
      //拼接成一个完整的颜色值，[r,g,b]
      let color = [r, g, b]
      //将颜色值添加到数组中
      imgDataRGB.push(color)
    }
    return imgDataRGB
  })
  const indexedMap = imgRGB.map(([r, g, b], index) => {
    // 四个角透明色区域返回透明色
    switch (index) {
      case 0:
      case 1:
      case 58:
      case 59:
      case 60:
      case 119:
      case 2760:
      case 2819:
      case 2820:
      case 2821:
      case 2878:
      case 2879:
        return 0
      default:
    }
    if (rainbowSheet[(r << 16) | (g << 8) | b] !== undefined) {
      // 如果彩虹表已有值，取出
      return rainbowSheet[(r << 16) | (g << 8) | b]
    }
    let minDeltaE = 101
    let acTindex = -1
    //初始值为1，屏蔽透明色
    for (let i = 1; i < 255; i++) {
      let res = deltaE(actRGB[i], [r, g, b], 'rgb')
      if (res < minDeltaE) {
        minDeltaE = res
        acTindex = i
      }
    }
    //添加颜色到彩虹表中
    rainbowSheet[(r << 16) | (g << 8) | b] = acTindex
    return acTindex
  })
  const buff = new ArrayBuffer(0x08 + 0x18 + 0x3c * 0x30)
  const headerDataView = new DataView(buff, 0)

  headerDataView.setUint16(0x00, 0x0000, true) // Empty
  headerDataView.setUint16(0x02, 0x003c, true) // FullWidth
  headerDataView.setUint16(0x04, 0x0030, true) // FullHeight
  headerDataView.setUint16(0x06, 0x0001, true) // NrOfFrames

  const frameDataView = new DataView(buff, 0x08)

  frameDataView.setUint16(0x00, 0x0000, true) // FrameX
  frameDataView.setUint16(0x02, 0x0000, true) // FrameY
  frameDataView.setUint16(0x04, 0x003c, true) // FrameWidth
  frameDataView.setUint16(0x06, 0x0030, true) // FrameHeight
  frameDataView.setUint32(0x08, 0x01, true) // Flags
  frameDataView.setUint8(0x0c, 0x00) // FrameColor R
  frameDataView.setUint8(0x0d, 0x00) // FrameColor G
  frameDataView.setUint8(0x0e, 0x00) // FrameColor B
  frameDataView.setUint8(0x0f, 0x00) // FrameColor Empty
  frameDataView.setUint32(0x10, 0x00, true) // Reserved
  frameDataView.setUint32(0x14, 0x20, true) // DataOffset

  const indexDataView = new DataView(buff, 0x20)
  indexedMap.forEach((val, idx) => {
    indexDataView.setUint8(idx, val)
  })

  return Buffer.from(buff)
}

;(async () => {
  const ra2ChsCameoList = fs
    .readdirSync(path.join(rootDir, 'cameo/ra2'))
    .filter((str) => {
      return str.endsWith('.png')
    })
  const yrChsCameoList = fs
    .readdirSync(path.join(rootDir, 'cameo/yr'))
    .filter((str) => {
      return str.endsWith('.png')
    })

  for (let i = 0; i < ra2ChsCameoList.length; i++) {
    const fileName = ra2ChsCameoList[i]
    fs.writeFileSync(
      path.join(
        rootDir,
        'cameo/ra2',
        path.basename(fileName, path.extname(fileName))
      ) + '.shp',
      await getShpBin(path.join(rootDir, 'cameo/ra2', fileName))
    )
    console.clear()
    console.log(
      'Ra2 Cameos converted: %d , total %d.',
      i + 1,
      ra2ChsCameoList.length
    )
  }

  for (let i = 0; i < yrChsCameoList.length; i++) {
    const fileName = yrChsCameoList[i]
    fs.writeFileSync(
      path.join(
        rootDir,
        'cameo/yr',
        path.basename(fileName, path.extname(fileName))
      ) + '.shp',
      await getShpBin(path.join(rootDir, 'cameo/yr', fileName))
    )
    console.clear()
    console.log(
      'YR Cameos converted: %d , total %d.',
      i + 1,
      yrChsCameoList.length
    )
  }
})()
