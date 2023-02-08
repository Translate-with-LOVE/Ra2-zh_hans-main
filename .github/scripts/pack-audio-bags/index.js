const fs = require('fs')
const path = require('path')
const AudioPackage = require('ra2-audio-bag-editor')

const rootDir = path.resolve('../../../')

const bagFileRA2 = fs.readFileSync(
  path.join(rootDir, '_src_files/audio/audio.bag')
)
const idxFileRA2 = fs.readFileSync(
  path.join(rootDir, '_src_files/audio/audio.idx')
)

const bagFileYR = fs.readFileSync(
  path.join(rootDir, '_src_files/audiomd/audio.bag')
)
const idxFileYR = fs.readFileSync(
  path.join(rootDir, '_src_files/audiomd/audio.idx')
)

const audioPackageRa2 = new AudioPackage(idxFileRA2, bagFileRA2)
const audioPackageYR = new AudioPackage(idxFileYR, bagFileYR)

const ra2ChsAudioList = fs.readdirSync(path.join(rootDir, 'audio_inBAG/ra2'))
const yrChsAudioList = fs.readdirSync(path.join(rootDir, 'audio_inBAG/yr'))

ra2ChsAudioList.forEach((fileName) => {
  const fileBuff = fs.readFileSync(
    path.join(rootDir, 'audio_inBAG/ra2', fileName)
  )
  audioPackageRa2.addItemFromWav(fileName, fileBuff)
})
yrChsAudioList.forEach((fileName) => {
  const fileBuff = fs.readFileSync(
    path.join(rootDir, 'audio_inBAG/yr', fileName)
  )
  audioPackageYR.addItemFromWav(fileName, fileBuff)
})

fs.writeFileSync(
  path.join(rootDir, '_src_files/audio/audio.bag'),
  audioPackageRa2.getBagFile()
)
console.log('Ra2 audio.bag Packed.')
fs.writeFileSync(
  path.join(rootDir, '_src_files/audio/audio.idx'),
  audioPackageRa2.getIdxFile()
)
console.log('Ra2 audio.idx Packed.')
fs.writeFileSync(
  path.join(rootDir, '_src_files/audiomd/audio.bag'),
  audioPackageYR.getBagFile()
)
console.log('YR audio.bag Packed.')
fs.writeFileSync(
  path.join(rootDir, '_src_files/audiomd/audio.idx'),
  audioPackageYR.getIdxFile()
)
console.log('YR audio.idx Packed.')
