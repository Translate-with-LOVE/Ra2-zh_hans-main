# 从 PNG 构建 SHP

每个资源目录放编号 PNG 和同名 ACT，一张生成单帧，多张按编号整数升序生成多帧。不缩放、不抖动，不默认复制到两个包。

| 源目录 | 构建产物 | 打包暂存目录 | 目标 MIX |
|---|---|---|---|
| shp/ra2/<资源名>/ | pack/shp/ra2/<资源名>.png/.shp | _src_files/language/ | language.mix |
| shp/yr/<资源名>/ | pack/shp/yr/<资源名>.png/.shp | _src_files/langmd/ | langmd.mix |

已提供的 grfxtxt 输入位于 shp/ra2/grfxtxt/：0000.png、0001.png、0002.png、0003.png 和 grfxtxt.act。各帧 436×112，保持原始帧序；四帧中间索引 PNG 为 436×448。该组素材已由用户在游戏内验收。旧 shp/grfxtxt.shp 保留对照，不再自动作为构建输入。

两目标允许同名资源，生成和暂存路径隔离。YR 目录中的每个资源也必须有自己的 ACT；不会套用 RA2 色盘。既有 _src_files/langmd/glslmd.shp 和 glsmd.pal 等资源仍由原打包流程保留。

## 构建

从仓库根目录运行 ./build.ps1；本地和 .github/workflows/release.yml 均先检查输入，再复用现有依赖运行资源测试及转换，最后沿用原项目的有/无中文语音打包流程。不引入 AI 语音逻辑或新依赖。-SkipNpmInstall 时仍会执行资源测试与 PNG→SHP 转换，其他既有步骤的行为保持原样。

单独运行：

    node .github/scripts/convert-png-to-shp/resources.js --check-inputs
    cd .github/scripts/convert-png-to-shp
    npm install
    npm run test:resources
    npm run resources

构建前会检查全部输入，不以旧 SHP 兜底；全部资源完成检查和像素转换后才写生成文件及暂存 SHP。PNG 只作中间产物，ACT 只作输入，均不进入 MIX。请从仓库根目录启动构建，以符合现有脚本的相对路径要求。

## 输入与色盘规则

- PNG 文件名只能为非负整数编号，例如 0000.png、0001.png 或 1.png、2.png、10.png。按数值排序，重复编号及混入其他 PNG 名称会报错。
- 同一资源的帧尺寸必须一致。输入为每通道 8 bit 的 RGB 或 RGBA PNG；索引或灰度源图报错。通用转换器不写死帧数或尺寸。
- ACT 文件名为 <资源名>.act。要求 256 色，支持 768 字节 RGB 表或附带 4 字节元数据的 772 字节格式。色数 0 表示 256；透明索引只能为 0 或 65535（未指定）。
- 中间 PNG 的全部 256 项 PLTE 保持 ACT 原值及原顺序。透明像素映射到索引 0；索引 0 透明，其他索引不透明。部分透明会报出帧名和像素位置，要求先明确合成背景。
- 不透明像素使用固定 RGB 平方距离最近色，不抖动；同距离或重复色取最小索引，全部 256 项参与。旧手工量化设置未记录，不保证复现未知算法。
- 先逐帧映射，再纵向连接索引字节；不将索引结果重新画到 RGBA 画布。PNG 与 SHP 使用同一组索引。
- 生成真正的未压缩 TS/RA2 SHP：8 字节主头、每帧 24 字节头、flags=1。不会将 PNG 改扩展名充当 SHP。

测试覆盖单/多帧、数字排序、双目标同名隔离、ACT 元数据、透明度、缺图与尺寸异常，并独立解码 PNG 检查全部 PLTE 和索引、解析 SHP 帧头/偏移/像素以及重复生成一致性。

载入图需分别核实游戏、格式、尺寸、使用的 PAL 和引用入口。构建用 ACT 与游戏用 PAL 是不同格式，不能把所有载入图统一套用 grfxtxt 色盘。
