// 引入fs&path模块
const fs = require('fs')
const path = require('path')

// Root DIR
const rootDir = path.resolve('../../../')

// 定义csf文件的结构
const csfFileHeaderSize = 0x18 // 文件头的字节数
const csfLabelHeaderSize = 0x0c // 标签头的字节数
const csfStringHeaderSize = 0x08 // 字符串头的字节数
const csfStringExtraSize = 0x04 // 字符串头扩展的字节数

const cp1252_Map = [
  0x20ac, 0x81, 0x201a, 0x192, 0x201e, 0x2026, 0x2020, 0x2021, 0x2c6, 0x2030,
  0x160, 0x2039, 0x152, 0x8d, 0x17d, 0x8f, 0x90, 0x2018, 0x2019, 0x201c, 0x201d,
  0x2022, 0x2013, 0x2014, 0x2dc, 0x2122, 0x161, 0x203a, 0x153, 0x9d, 0x17e,
  0x178,
]

// 写入CSF文件
function writeCSFFile(csfObject, filePath) {
  const bufList = []
  const keys = Object.keys(csfObject)

  // console.log(keys.length)

  // 构建文件头
  const fileHeaderBuffer = Buffer.alloc(csfFileHeaderSize)
  // 填充文件头
  const fileID = ' FSC' // 文件标识符，应为' FSC'
  const version = 3 // 文件版本，应为3
  const numLabels = keys.length // 文件中的标签数
  const numStrings = keys.length // 文件中的字符串对数
  const languageCode = 9 // 语言代码

  fileHeaderBuffer.write(fileID, 0, 4, 'ascii')
  fileHeaderBuffer.writeUInt16LE(version, 0x04)
  fileHeaderBuffer.writeUInt16LE(numLabels, 0x08)
  fileHeaderBuffer.writeUInt16LE(numStrings, 0x0c)
  fileHeaderBuffer.writeUInt16LE(languageCode, 0x14)
  // 填入总Buffer
  bufList.push(fileHeaderBuffer)

  keys.forEach((label) => {
    // 负载str对象
    strObj = csfObject[label]
    // 构建标签头
    const labelHeaderBuffer = Buffer.alloc(csfLabelHeaderSize)
    // 填充标签头
    const labelID = ' LBL' // 标签的ID，应为' LBL'
    const numStrings = 1 // 标签下的字符串数，在这里为1
    const labelNameLength = label.length // 标签的名称长度

    labelHeaderBuffer.write(labelID, 0, 4, 'ascii')
    labelHeaderBuffer.writeUInt16LE(numStrings, 0x04)
    labelHeaderBuffer.writeUInt16LE(labelNameLength, 0x08)

    // 构建标签名
    const labelNameBuffer = Buffer.alloc(labelNameLength)
    // 填充标签名
    labelNameBuffer.write(label, 0, label.length, 'ascii')
    // 填入总Buffer
    bufList.push(labelHeaderBuffer)
    bufList.push(labelNameBuffer)

    // 构建字符串头
    const stringHeaderBuffer = Buffer.alloc(csfStringHeaderSize)
    // 填充字符串头
    const stringID = strObj['Extra'] === undefined ? ' RTS' : 'WRTS' // 字符串的ID，应为' RTS'或'WRTS'
    const stringLength = strObj['Value'].length // 字符串长度

    stringHeaderBuffer.write(stringID, 0, 4, 'ascii')
    stringHeaderBuffer.writeUInt16LE(stringLength, 0x04)

    // 构建字符串内容
    const stringContentBuffer = Buffer.alloc(stringLength * 2)
    stringContentBuffer.write(strObj['Value'], 0, stringLength * 2, 'utf16le')

    for (let i = 0; i < stringContentBuffer.length; i += 2) {
      let sp = false
      const testValue =
        (stringContentBuffer[i + 1] << 8) | stringContentBuffer[i]
      const testIndex = cp1252_Map.indexOf(testValue)
      if (testIndex > -1) {
        stringContentBuffer[i + 1] = 0
        stringContentBuffer[i] = testIndex + 0x80
        sp = true
      }
      stringContentBuffer[i] = ~stringContentBuffer[i]
      stringContentBuffer[i + 1] = ~stringContentBuffer[i + 1]
    }

    // 填入总Buffer
    bufList.push(stringHeaderBuffer)
    bufList.push(stringContentBuffer)

    if (stringID === 'WRTS') {
      // 额外内容
      const extraValueLengthBuffer = Buffer.alloc(csfStringExtraSize)
      const extraValueLength = strObj['Extra'].length
      extraValueLengthBuffer.writeUInt16LE(extraValueLength, 0)

      const extraValueBuffer = Buffer.alloc(extraValueLength)
      extraValueBuffer.write(strObj['Extra'], 0, extraValueLength, 'ascii')

      bufList.push(extraValueLengthBuffer)
      bufList.push(extraValueBuffer)
    }
  })

  fs.writeFileSync(filePath, Buffer.concat(bufList))
}

const csfObjectRa2 = JSON.parse(fs.readFileSync(path.join(rootDir,'text-rep/','ra2.zh_Hans.json')))
const csfObjectRa2md = JSON.parse(fs.readFileSync(path.join(rootDir,'text-rep/','ra2md.zh_Hans.json')))
writeCSFFile(csfObjectRa2, path.join('ra2.csf'))
writeCSFFile(csfObjectRa2md, path.join('ra2md.csf'))