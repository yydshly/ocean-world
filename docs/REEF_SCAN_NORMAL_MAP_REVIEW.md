# USNM 229 Low 接入独立审查：尺度烘焙与法线贴图

日期：2026-10-03。结论：对当前默认 Low 加载器和测试的源码快照，**未发现具体接入 bug**。正旋转与正统一毫米缩放不会因烘焙进 geometry 而丢失当前 Three 的 tangent-space normal map 方向；应用也正确保留了 GLTFLoader 对无 TANGENT 网格的派生切线约定。此结论不等于实际浏览器像素、GPU 性能、科学真实性或正式 soak 验收。

本审查没有修改应用、测试、旧 helper、原 GLB、manifest 或冻结构建；仅增加 [独立复核脚本](../output/validation/review-reef-scan-normal-map-v1.mjs) 与 [不可覆盖的新证据](../output/validation/reef-scan-normal-map-review-v1.json)。报告记录所有输入字节／SHA、测试 stdout，检查前后 hash 一致。既有 [候选解码证据](../output/validation/reef-scan-detail-candidate-inspection-v1.json) 与 [候选选择说明](REEF_SCAN_DETAIL_CANDIDATE.md) 保留原结论。

## 成功加载路径证据

独立脚本实际调用应用的 `loadReefSkeletonScan()`，没有传 detail，因此验证当前默认 **Low**。它使用真实 r186 GLTFParser、实际官方原 GLB、应用的 header／运行时 SHA 校验、加载所有权及当前归一化函数；压缩 geometry 由留存的官方 Draco WASM 实际解码。Worker 消息传输用 Node stub 代替，ImageBitmap 的像素对象也用 stub 代替，尺寸取自实际内嵌 JPEG 头。**本次没有用真实浏览器 Worker 或实际 ImageBitmap 像素解码**；8 张原 JPEG 的既有 Pillow 实际解码证据在候选报告中，不混为本次浏览器证明。

成功路径得到：

- 150,000 面／120,929 顶点，1 个 mesh；GLB 与 manifest 的运行时 SHA 都校验通过，physicalScaleMultiplier 为 1。
- baseColor／AO／normal 三张 1024²，分别为 sRGB／NoColorSpace／NoColorSpace；全部使用 UV0、flipY=false。
- `normalMapType = TangentSpaceNormalMap`、没有 TANGENT 属性；实际最终材质 `normalScale = [1, −1]`。
- 原 metallicFactor 0.100000001490116、roughnessFactor 0.800000011920929 没有被应用重写。
- owner 记录 1 geometry／2 material／3 texture／3 bitmap；成功返回前 worker 已释放。重复 dispose 后，每张 stub bitmap 只 close 一次、worker 只 terminate 一次。
- 相同 0.060 m 显示剪裁后 140,772 面／115,927 顶点，保留原尺度；基部仍开放，没有重建生物附着。

再次独立执行 `node --test tests/reef-scan-assets.test.mjs`，**15／15 通过**。这些测试中的取消、超时、失败及 StrictMode 类交叠路径使用真实 Parser、mock Worker／图片解码；不能写成真实 GPU 生命周期通过。

## 为什么 manifest 烘焙保持当前法线贴图方向

[glTF 官方规范](https://registry.khronos.org/glTF/specs/2.0/glTF-2.0.html#_material_normaltexture) 将 normal texture 定义为 tangent-space 线性数据；没有 TANGENT 时建议从 position／normal／相应 UV 用 MikkTSpace 生成切线。这份官方 GLB 没有显式 TANGENT。

已核对项目本地 **Three 0.186.1** 的真实源码：

- `BufferGeometry.applyMatrix4` 变换 position，并通过 normal matrix 变换 normal；当前归一化不改变 UV 与索引。
- GLTFLoader `assignFinalMaterial` 检测无 TANGENT 后，把最终材质的 `normalScale.y` 乘 −1。这是该加载器与 derivative TBN 的配套约定，**应用不应额外恢复为 [1,1] 或翻转贴图绿色通道**。
- shader 的 `normal_fragment_begin` 使用变换后的 view position、normal 和 normalMap UV；`getTangentFrame` 通过位置／UV 屏幕导数与叉积重建 T/B，再在 `normal_fragment_maps` 里将 map normal 乘此 TBN。

当前外部 manifest 变换只有正规化四元数旋转、正统一缩放 0.001 和平移，没有镜像或非统一缩放。对于 proper rotation R 和正缩放 s，位置导数随 sR 变换，法线随 R 变换；叉积和共同长度归一化后的 T/B 随 R 变换，平移在导数中抵消。随后 XZ／Y 归中也只有平移。因此 **此烘焙与当前 derivative TBN 构造相容**。这里是基于实际本地代码与变换性质的推导，不是用一般“所有变换都安全”的假设。

独立脚本对原实际解码 geometry 和应用烘焙结果的全部 **150,000 面**执行相同的叉积／UV／共同缩放公式，使用三角边作为导数基；UV 与 index buffers 逐字节保持。旋转行列式约 1，完整米制变换行列式约 1e−9；没有排除的零 frame。Float32 烘焙与双精度预期之间的最大误差为：

| 数值复核项 | 最大误差 |
| --- | ---: |
| T 向量 | 0.00013626648 |
| B 向量 | 0.00010219986 |
| N 向量 | 0.00000021558 |
| 示例扰动法线方向 | 0.00006643128 rad，约 0.00381° |

示例 tangent map vector 经 normalScale 后为 `[0.2728804473, −0.3133071802, 0.9096014909]`；这是计算复核向量，**不是从具体纹理 texel、实际 fragment 或生物测量提取的值**。数值检查验证了当前变换的协变性和浮点误差，没有运行 WebGL shader。

## 后续实际评审的边界

Three 的 derivative frame 并不因此获得与原贴图烘焙所用 MikkTSpace／其他切线框架完全相同的证明。资产缺少显式 TANGENT，源 normal bake 使用何种切线框架没有独立核实；UV seam、已有源面／顶点法线方向不一致、贴图压缩误差，仍可能在近景产生渲染缺陷。这属于需要实际镜位和光照评审的资产／渲染边界，目前没有证据表明它是新增 manifest 变换 bug。

建议实际浏览器记录 metadata 的 normalScale／normalMapType、三图 channel／flipY／colorSpace 和来源 hash，再查看固定相机近景中是否出现成片反向凹凸、镜像细节、接缝或局部异常。只有明确渲染证据要求时，再另外评估显式 MikkTSpace 切线或有记录的显示修复；不要先改绿通道或重置 normalScale。

科学身份与尺度仍正确保留：Dry A. cytherea 馆藏死亡骨架、未核实完整群体、原单位 mm／显示 m、标本尺度 multiplier=1。normal map 表达的是该馆藏导出资产的表面法线信息，不证明活体组织、原位孔隙、色彩校准或生态共现。此审查未独立复测新几何的海床接触，也没有延长任何既有正式性能记录。
