//代码基于 New Bing 生成修改

//引入fs模块，用于读取文件
const fs = require('fs')
const { createCanvas, loadImage } = require('canvas')
const { deltaE } = require('color-delta-e')
const path = require('path')

const rootDir = path.resolve('../../../')

const rainbowSheet = {}

/**
 * 定义一个lambda函数，接受一个act文件的路径作为参数，返回一个Promise对象
 * @param {string} file 文件名
 */
const parseACT = (file) => {
  //创建一个空数组，用于存储颜色值
  let colors = []
  //以Hex方式读取文件
  const data = fs.readFileSync(file)
  //遍历每个字节，每三个字节代表一个颜色值（RGB）
  for (let i = 0; i < data.length; i += 3) {
    //获取当前字节
    let r = data[i]
    let g = data[i + 1]
    let b = data[i + 2]
    //添加颜色到彩虹表中
    rainbowSheet[(r << 16) | (g << 8) | b] = i
    //拼接成一个完整的颜色值，[r,g,b]
    let color = [r, g, b]
    //将颜色值添加到数组中
    colors.push(color)
  }
  return colors
}

const actRGB = parseACT('cameo.act')

const getShpBin = async (fileName) => {
  const canvas = createCanvas(60, 48)
  const ctx = canvas.getContext('2d', { alpha: false })
  const imgRGB = await loadImage(fileName).then((image) => {
    ctx.drawImage(image, 0, 0, 60, 48)
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
  const indexedMap = imgRGB.map(([r, g, b] = pixelRGB) => {
    // 如果彩虹表已有值，取出
    if (rainbowSheet[(r << 16) | (g << 8) | b] !== undefined) {
      return rainbowSheet[(r << 16) | (g << 8) | b]
    }
    let minDeltaE = 101
    let acTindex = -1
    for (let i = 0; i < 255; i++) {
      let res = deltaE(actRGB[i], pixelRGB, 'rgb')
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
  const ra2ChsCameoList = fs.readdirSync(path.join(rootDir, 'cameo/ra2'))
  const yrChsCameoList = fs.readdirSync(path.join(rootDir, 'cameo/yr'))

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
