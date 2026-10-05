# USNM 229：150k 近景候选的原文件、实际解码与接入建议

核查日期：2026-10-03。推荐先接入 **150k／1024 Low**，再用实际浏览器比较同镜位近景。Low 与 150k／2048 Medium 的压缩几何、实际解码顶点／法线／UV／索引，以及相同底座剪裁后的几何都逐字节一致。Medium 仅提高三张 JPEG 的像素尺寸；目前没有同镜位渲染证据证明额外纹理成本值得默认开启。本文没有修改应用源码、旧解码 helper、原始 20k 文件、manifest 或任何冻结构建。

这是同一 **Acropora cytherea、USNM 229、Dry 馆藏骨架**的官方 derivative。继续表示死亡骨架环境样本，不能替换具名活体 A. muricata，不能计入模拟个体、活体组织、生态共现或额外物种。模型的具体媒体 public-domain 声明、CC0 政策依据与 manifest 通用版权文案冲突的保留方式，见 [既有资产说明](REEF_SCAN_ASSETS.md) 和 [许可证据原文件](../public/assets/reef-scan/license-evidence.json)。两份新 derivative 属于同一个官方 3D package，来源没有转为第三方资产。

## 原文件与来源

下载 URL 从已保存的 [原 manifest](../public/assets/reef-scan/document.json) 的实际 derivative URI，以及既有 manifest 下载 receipt 的包目录拼接；没有猜测其他标本或未列出的变体。无账户、无 Cookie，官方 GET 均返回 HTTP 200／`model/gltf-binary`，实际字节数与 manifest 一致。下载始于 2026-10-03T06:29:41Z；具体请求时间、响应 Content-Length／Last-Modified／ETag 见 [新下载留存](../public/assets/reef-scan/detail-candidate-download-receipts-v1.json)。

| 原文件 | 字节 | 完整文件 SHA-256 |
| --- | ---: | --- |
| [20k／512 Thumb，原有文件](../public/assets/reef-scan/usnm_229-20k-thumb.glb) | 323,096 | `c3ce125d357952ff1caa68efb920fcd4876d29459517d83b2de2a3aa211f8060` |
| [150k／1024 Low，新候选](../public/assets/reef-scan/usnm_229-150k-1024-low.glb) | 1,729,252 | `11a2bedd6925eae830831e191eb4a13668eb93e6ba9c44270534f574ec89f12b` |
| [150k／2048 Medium，新候选](../public/assets/reef-scan/usnm_229-150k-2048-medium.glb) | 4,244,612 | `20563502ece6c714c6a8853fa7add4d8dc4e3897d77f27aff1c93fda3c78a114` |

官方直接来源：[Low](https://3d-api.si.edu/content/document/3d_package:ad22ed7a-d030-4162-8880-e9cd65232514/usnm_229-150k-1024-low.glb)、[Medium](https://3d-api.si.edu/content/document/3d_package:ad22ed7a-d030-4162-8880-e9cd65232514/usnm_229-150k-2048-medium.glb)、[manifest](https://3d-api.si.edu/content/document/3d_package:ad22ed7a-d030-4162-8880-e9cd65232514/document.json)。两个新 GLB 均保留官方完整原字节，无减面、图片重压缩或补洞。旧 manifest SHA-256 仍为 `a6332dc422504fc2793124b159301a5aa33a82096d0a591dcfd7fa1d704c8418`。

## 已执行的几何与图像检查

[独立检查脚本](../output/validation/inspect-reef-scan-detail-candidate.mjs) 使用项目已留存的官方 Draco wrapper／WASM 在 Node VM 中实际解码；20k 调用原 helper，150k 解码逻辑单独放在本次新脚本，未改变旧测试的目标。三份文件都调用应用当前的 `normalizeReefSkeletonGroup` 与 `prepareReefSkeletonDisplay`；输入文件在检查前后 SHA-256 一致。8 张内嵌 JPEG 从 bufferView 原样提取，用 Pillow `Image.load()` 实际解码，不只读取头部尺寸。

[完整检查报告](../output/validation/reef-scan-detail-candidate-inspection-v1.json) SHA-256：`3c9f0577c232bdfde6e5bb94a86ed030e3d3c1fdac04b130b267fe8351d450d6`。该报告为新文件且写入时拒绝覆盖；Node 22.15.0、Three 0.186.1、three-mesh-bvh 0.9.15。它属于 CPU 几何／JPEG 解码证据，不属于浏览器视觉、GLTFLoader／Worker 路径、GPU、帧率或 20 分钟稳定性结论。

| 实际解码／显示量 | 20k／512 | 150k／1024 与 150k／2048 |
| --- | ---: | ---: |
| 原三角面／顶点 | 20,000／23,488 | 150,000／120,929 |
| 完全在切面下移除的原面 | 892 | 9,330 |
| 跨切面剪裁的原面 | 70 | 206 |
| 完整保留的原面 | 19,038 | 140,464 |
| 剪裁后显示三角面／顶点 | 19,146／22,909 | 140,772／115,927 |
| 剪裁后宽 × 高 × 深，m | 0.6265922785 × 0.2832714319 × 0.4115196466 | 0.6287682056 × 0.2844150066 × 0.4138900936 |
| 剪裁后属性＋索引 buffer 字节 | 847,964 | 5,398,928 |
| 间接 BVH 的实有 CPU buffers 字节 | 218,420 | 1,888,816 |
| 检查阈值内的退化面／越界索引 | 0／0 | 0／0 |
| 原面法向与三顶点法线均值方向不一致 | 585 | 400 |
| 剪裁后上述方向不一致 | 577 | 396 |

法线均有限、长度在 0.999–1.001 内；position／normal／UV 均有限且数量匹配。退化判断采用叉积长度 ≤ 1e−14 m²。上述法线方向不一致来自原资产，不能把此扫描称为拓扑或法线毫无缺陷；本次没有擅自反面或重算法线。

两份 150k 的 Draco 压缩 bufferView 同为 743,944 B 且 SHA 相同，归一化后的所有属性／索引和显示几何也相同。150k 与 20k 的包围盒存在约 1.1–2.4 mm 的轴向差异，这是不同导出／减面版本的实际差异；没有缩放到强行相同。仍使用 manifest 的毫米旋转／平移顺序 `S(0.001) × T(mm) × R(q)`，随后仅 XZ 归中、最低 Y 归零，group scale 为 1。

0.060 m 的原归一化切面可执行且显示最低 Y 为 0。它仍是为排除人工展示底座而选定的场景剪裁，**切开的基部保持开放**；没有恢复生物附着或完整群体。本文没有重新检验 115,927 顶点在当前海床的位置，也不据包围盒推断接触正确；接入后需对新几何重新执行真实硬底 ray 检查。

## 贴图差异与成本

| 项目 | 20k／512 | 150k／1024 Low | 150k／2048 Medium |
| --- | ---: | ---: | ---: |
| 内嵌贴图 | baseColor、AO | baseColor、AO、normal | baseColor、AO、normal |
| 实际 JPEG 尺寸 | 两张 512² | 三张 1024² | 三张 2048² |
| RGBA8、不含 mip 的估算 GPU 字节 | 2,097,152 | 12,582,912 | 50,331,648 |
| RGBA8、含完整 mip 的估算 GPU 字节 | 2,796,200 | 16,777,212 | 67,108,860 |

Medium 比 Low 多下载 **2,515,360 B**，RGBA8 全 mip 估算多 **50,331,648 B（48 MiB）**，没有几何收益。上表只按像素数／格式计算，**不是实际驱动显存测量**；不含解码器、源 GLB、JS 对象、纹理临时副本、内存对齐或 GPU 内部格式。属性／索引和 BVH 的字节数则来自实际 typed-array／ArrayBuffer，也不覆盖全部峰值内存。

原样提取的图像留在 [纹理证据目录](../output/validation/reef-scan-detail-textures-v1/usnm_229-150k-1024-low-baseColor.jpg)，每张字节数与 SHA 在完整报告中。已查看 Low 基色与法线 atlas：其中仍有人工底座的纹理岛，几何剪裁不会删除整张原纹理；这是原文件的一部分。离散 atlas 图块并不能作为原位珊瑚孔隙、活体颜色或科学校色证据。Medium 的全部 JPEG 也已成功实际解码，但未做同镜位屏幕视觉比较。

本次 Node 单次冷／热混合解码＋归一化约 121／308／207 ms（Thumb／Low／Medium），剪裁约 43／120／133 ms，BVH 约 32／89／73 ms。这些是报告原始单次 CPU 观测，初始化顺序不同；**不能拿 308 与 207 ms 宣称 Medium 更快**，也不能据它们预测浏览器 FPS。

## 接入必须显式修改的契约

1. 给候选定义独立明确的 `file／bytes／SHA／triangles／imageSize／textureRoles`，保留 Thumb 的显式测试或兼容选项。当前加载器中 323,096 字节、20,000 面、两个内嵌图片及 20k derivative 的硬编码无法直接接受新文件。
2. 按实际 source material 接管 **第三张 normal map**；baseColor 保留 glTF 的 sRGB，AO／normal 保留数据贴图色彩空间、原 UV／flipY／channel，不把 normal atlas 当成颜色，也不擅自重压缩或翻转。所有 texture／ImageBitmap 都仍由独立 owner 去重接管，取消、初始化失败和迟到结果同样释放。
3. 保留官方材质的 metallicFactor 0.10000000149、roughnessFactor 0.80000001192 等实际值；若为了水下材质调整，另外记录为显示推断，不能覆盖原头或称其是实物测量值。无显式 tangent 属性；真实 GLTFLoader／Three 法线贴图渲染需要浏览器验证。
4. 所有 115,927 显示顶点在原尺度重新执行硬底放置与接触采样，并按新 bounds 预留场景空隙。底座剪裁在 BVH 前执行。确认原面法线局限不会造成近景明显异常，再判断是否要另外做有记录的显示修复。
5. 本地静态资源路径使用同一 `/assets/reef-scan/`，无运行时 Smithsonian／CDN 请求。新候选接入后需要按当前真实浏览器资源数重新设基准；旧冻结构建和已有正式记录不得因下载新候选而改写。
6. 在固定原尺度、相同实际相机、光照与截图尺寸下比较 Thumb／Low；只有 Low 的近景表现仍明显受像素限制时再评估 Medium。正常全景与宏观截图分别记录，不以 triangle 数量或 atlas 尺寸代替自然写实验收。

候选现已具备可直接接入的本地原路径、完整 SHA、许可证据、实际几何与图像报告。**推荐 Low 是成本与已核实技术事实的选择；近景是否达到纪录片写实仍需实际渲染评审。**
