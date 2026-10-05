# 真实珊瑚扫描候选：来源、尺度与导入边界

核查日期：2026-10-03。状态：**只读资产研究；尚未导入、减面或视觉验收**。本次没有下载完整网格、网格二进制缓冲或贴图，只读取官方网页、Voyager manifest、HTTP HEAD 和 GLB 的小型 JSON 头。项目源码、冻结构建与验证报告均未修改。

结论：先尝试一个约 62 cm 的 **Acropora cytherea** 扫描近景样本，作为**死亡骨架环境层**，最有价值。下列三个 Smithsonian 候选都有实际三角网格及内嵌基色／AO 贴图，许可来源可追踪；但全是**干燥馆藏骨骼**，不能直接充当活体颜色或一整片米级珊瑚礁。Porites 与 Diploastrea 的实物很小，适合形态与微结构参考。此次没有找到已核实的活体原位 CC0 扫描，也没有核实到同时满足「原位活体、整片景观、可直接导入的带贴图网格、允许修改」的官方资产。

## 共同许可证据与技术事实

- 各对象官方记录把所展示的 **3D media** 明确写为 public domain；这与记录末尾的 `Metadata Usage: CC0` 是两项不同证据。不是仅凭元数据许可推断模型许可。Smithsonian 的 [Open Access FAQ](https://www.si.edu/openaccess/faq) 说明 CC0 数字资产可修改和再分发，并包含 3D 模型；[官方 3D 开放访问说明](https://avpreservation.si.edu/spotlight/openaccesshighlights) 说明带 CC0 标记的模型可下载及改编。
- 下面列出的官方 GLB 中，JSON 头确认同一文件内有两个 JPEG `bufferView`，分别用于 `baseColorTexture` 与 `occlusionTexture`；没有引用外部第三方图片。对象媒体的 public-domain 声明适用于这份模型资产及其内嵌贴图。**教学页面另外附的活体照片和注释图片不属于这些 GLB**，不能沿用模型的 CC0 许可。
- Voyager `document.json` 的通用 `asset.copyright` 仍写着 “All rights reserved”。这里记录对象页对具体 3D media 的 public-domain 声明作为许可依据，并保留这一不一致，导入时应保存对象媒体许可证据、下载时间与文件 SHA-256；不能把通用 manifest 文案抹掉后声称它也写了 CC0。
- 三个 20k GLB 的 JSON 头均声明 `KHR_draco_mesh_compression`。连缩略网格也需要 Draco 解码，不能当成无需解码器的普通 GLB。两个贴图、压缩几何、实际单位和大偏移都已在元数据层核对，完整拓扑与贴图视觉内容尚未检查。
- 无账户、无登录 Cookie 的官方 HEAD 请求均返回 `200` 和 `Content-Type: model/gltf-binary`；GLB JSON 的分段请求返回 `206`。因此这些直接入口当前无需账户。官网对象页面的抓取有 403／重定向限制，对象身份与媒体许可采用搜索索引可见的官方记录，文件参数采用可实时读取的官方 API；这不是完整的离线许可档案。

## 1. Acropora cytherea — 优先近景扫描样本

官方原名 **Madrepora cytherea**，馆藏 USNM 229，记录同时给出名称 Acropora cytherea (Dana, 1846)。来自法属波利尼西亚 Tahiti／Society Islands，1838–1842 年美国探索远征，馆藏标为 syntype，Preparation: Dry。身份与地点见 [官方 3D 对象记录](https://www.si.edu/object/3d/madrepora-cytherea%3Aad22ed7a-d030-4162-8880-e9cd65232514) 和 [Smithsonian 珊瑚教学条目](https://3d.si.edu/corals/coral-community)。

补充核对：[当前 Smithsonian 馆藏记录](https://www.si.edu/object/madrepora-cytherea%3Anmnhinvertebratezoology_13935) 的官方搜索索引内容显示 Record Last Modified 为 **7 May 2026**，并仍将具体 **3D media** 声明为 public domain。它补强对象身份与媒体许可的证据链；搜索索引内容没有保存成官网的完整离线许可档案。当前研究及接入建议不依赖 Sketchfab 页面或其许可证。

| 已公布版本 | 官方文件字节数 | manifest 面数 | manifest 图像边长 |
| --- | ---: | ---: | ---: |
| Thumb GLB | 323,096 | 20,000 | 512 |
| Medium GLB | 4,244,612 | 150,000 | 2,048 |
| High GLB | 13,563,876 | 150,000 | 4,096 |

[Voyager manifest](https://3d-api.si.edu/content/document/3d_package:ad22ed7a-d030-4162-8880-e9cd65232514/document.json) 明确 `models[0].units = mm`。模型轴向包围盒范围约 **618.2 × 424.0 × 343.8 mm**，不是三个世界轴方向的宽／高／深；20k GLB 的 POSITION bounds 与该毫米数量级一致。原始坐标有约 −85,000 mm 的偏移，方向也依赖 manifest 的 rotation，不能只加载文件后令 `scale = 1`。

该模型的 manifest 变换为 translation **[123.4798433, 85448.2661409, 411.0341693] mm**，rotation quaternion **[-0.6996146, 0.0894695, 0.0890022, 0.7032874]**（x, y, z, w）。20k GLB 自身的唯一 node 只有 `mesh: 0`，不携带这些变换；导入时要将这个 manifest 变换用于模型，再统一换算为米。

下载入口：[20k GLB](https://3d-api.si.edu/content/document/3d_package:ad22ed7a-d030-4162-8880-e9cd65232514/usnm_229-20k-thumb.glb) · [150k／2048 GLB](https://3d-api.si.edu/content/document/3d_package:ad22ed7a-d030-4162-8880-e9cd65232514/usnm_229-150k-2048-medium.glb)。均已用 HEAD 核实，无需账户。

用途：一个独立、来源标注清楚的死亡骨架近景景观样本，先以原尺度验证轮廓与孔隙。当前模拟中的具名鹿角珊瑚是 **A. muricata**，不能把这份 A. cytherea 网格替换到其名下后仍沿用原物种名称、行为和数量。这份资产本身也不能代替活体具名个体；任何未来活体重建都应另立资产、另做有参考依据的组织材质并标明推断，不能称为实物原色。

未核实：完整网格的破洞／封底、扫描误差、JPEG 的实际像素尺寸及色彩校准、是否完整群体而非切取标本；正式 OBJ 下载包及其单位没有独立核实。本次只确认列出的 GLB。

## 2. Porites lobata — 块状珊瑚的小尺度形态参考

馆藏 USNM 646，Porites lobata Dana, 1846，Hawai‘i，1838–1842 年美国探索远征，馆藏 syntype，Preparation: Dry。依据 [官方对象记录](https://3d.si.edu/object/3d/porites-lobata%3A010228bb-75de-4fff-a848-c70584ce1087) 和 [官方教学条目](https://3d.si.edu/corals/coral-community)；具体 3D media 标为 public domain。

| 已公布版本 | 官方文件字节数 | manifest 面数 | manifest 图像边长 |
| --- | ---: | ---: | ---: |
| Thumb GLB | 171,660 | 20,000 | 512 |
| Medium GLB | 2,635,028 | 150,000 | 2,048 |
| High GLB | 7,450,508 | 150,000 | 4,096 |

[Voyager manifest](https://3d-api.si.edu/content/document/3d_package:010228bb-75de-4fff-a848-c70584ce1087/document.json) 明确模型单位为 **m**，轴向包围盒约 **0.1590 × 0.2044 × 0.0952 m**。20k GLB 的 POSITION bounds 也在这个米数量级。它并不是两米直径的整块礁体。

manifest translation 为 **[-0.0069586, -0.000339, -0.050111] m**，没有 model rotation 字段。20k GLB 的 node 只有 `mesh: 0`；需要显式处理这个小偏移。标本完整／残片范围尚未核实，不能因名称为块状珊瑚就把它当成完整的大群体。

下载入口：[20k GLB](https://3d-api.si.edu/content/document/3d_package:010228bb-75de-4fff-a848-c70584ce1087/USNM_646-20k-thumb.glb) · [150k／2048 GLB](https://3d-api.si.edu/content/document/3d_package:010228bb-75de-4fff-a848-c70584ce1087/USNM_646-150k-2048-medium.glb)。均已用 HEAD 核实，无需账户。

用途：保持实物尺度的小块骨骼、块状轮廓与小珊瑚杯的近景参考。若用来改进现有米级块状景观，应重建群体形状与适当尺度的表面细节；**不能等比放大十倍后把随之放大的珊瑚杯当成真实结构**。不能把一个馆藏样本的地点当成现有综合生境的同场调查证据。

未核实：完整群体／切取范围、封底和病损情况、采集深度、实物扫描误差与活体颜色。本次没有核实该对象的 OBJ／PLY 下载版本。

## 3. Diploastrea heliopora — 蜂窝珊瑚微结构参考

馆藏 USNM 1183350，Diploastrea heliopora (Lamarck, 1816)，1920 年 5 月、American Samoa 的 Tutuila／Pago Pago Harbor／Aua Reef 外缘浅潮池，Preparation: Dry。来源 [官方馆藏记录](https://www.si.edu/object/diploastrea-heliopora%3Anmnhinvertebratezoology_10273681) 和 [官方 Ecosystem Engineers 条目](https://3d.si.edu/corals/ecosystem-engineers)；后者明确这是从较大群体折取的小块。具体 3D media 标为 public domain。

| 已公布版本 | 官方文件字节数 | manifest 面数 | manifest 图像边长 |
| --- | ---: | ---: | ---: |
| Thumb GLB | 218,368 | 20,000 | 512 |
| Medium GLB | 3,533,212 | 150,000 | 2,048 |
| High GLB | 10,286,876 | 150,000 | 4,096 |

[Voyager manifest](https://3d-api.si.edu/content/document/3d_package:4876620d-4fc8-4d36-af06-bcfd2fab78be/document.json) 指定单位 **mm**，轴向包围盒约 **98.1 × 45.9 × 77.5 mm**。20k GLB 仍有 −27,000／−13,000 mm 量级偏移；必须处理 manifest 变换及毫米到米的换算。

manifest translation 为 **[1.7920341, 27193.9990234, 12965.2749023] mm**，没有 model rotation 字段。20k GLB node 只有 `mesh: 0`；translation 也应按毫米一起换算，不能只对顶点乘 0.001 后仍保留毫米平移。

下载入口：[20k GLB](https://3d-api.si.edu/content/document/3d_package:4876620d-4fc8-4d36-af06-bcfd2fab78be/USNM_1183350-20k-thumb.glb) · [150k／2048 GLB](https://3d-api.si.edu/content/document/3d_package:4876620d-4fc8-4d36-af06-bcfd2fab78be/USNM_1183350-150k-2048-medium.glb)。均已用 HEAD 核实，无需账户。

用途：珊瑚杯、隔片与骨骼断面的精细参考，或厘米级骨骼样本。**不适合直接替换一个米级蜂窝珊瑚景观**。若据其表面重建活体组织材质，派生材质应另记作者与处理方法。[物种事实页](https://www.coralsoftheworld.org/species_factsheets/species_factsheet_summary/diploastrea-heliopora/) 可辅助区分整群体轮廓及活体颜色，但该网页照片不因扫描模型 CC0 而自动变成可复用贴图。

未核实：扫描计量精度、完整 JPEG 像素尺寸、扫描时实际颜色校准以及 OBJ／PLY 版本。表中面数和图像边长来自官方 manifest，未独立解码数面。

## 对现有渲染、碰撞与性能的影响

以下是结合当前代码作出的实施判断，不是扫描数据发布方给出的保证。

- 现有 `ReefWorld.makeTerrain()` 最多放置 165 个 `createCoralLandscape()` 景观对象；每五个含一个块状代理。当前块状低精度几何约 3,096 个三角形。只把最多 33 个块状对象换成 20k 扫描，增加约 **557,832** 个三角形；换成 150k 则增加约 **4,847,832**。全部 165 个采用 20k 扫描就有 330 万个珊瑚三角形，尚未计鱼、地形和阴影重复绘制。直接全量替换会改变已经测过的性能负载。
- 应先做 1 个 20k 样本的实景近远对照；保留共享几何／材质／贴图和引用计数，再决定减面或 LOD。各实例共享内存不代表 GPU 可以免画其三角形。额外的 AO 贴图、Draco 解码、纹理上传和新材质程序也要重新量测启动成本与 20 分钟资源稳定性。
- 统一使用米；先核对 `models[].units`、translation、rotation，再确定底部与海床的接触。不要导入 Voyager 的摄影棚灯光、相机或背景。GLB 默认金属度约 0.1、粗糙度约 0.8 是转换工具材质参数，不是活体珊瑚反射率测量。
- 模拟底部约束来自 `habitat.js` 的连续高度场与 authored rocks；装饰珊瑚本身没有对应行为碰撞体。换扫描网格不会自动让鱼避开分枝，也不会自动增加庇护或可食生物量。若扫描改变可通行体积，应同步提供有明确精度的碰撞代理／高度场，并保持视觉与行为边界一致，不能把材质改进当成生态模型改进。
- 相机聚焦的 `focusObstacles()` 会遍历装饰网格做射线遮挡；扫描的高面数会增加聚焦查询成本。可评估低精度碰撞代理或 BVH，但必须保留正确孔隙，验证聚焦与底栖接触后再接入。

## 检索过但未列为生产候选的原位／活体资料

- [Pocillopora Damicornis Fresh Sample — Zenodo](https://zenodo.org/records/13380203) 是研究作者发布的 OBJ＋MTL＋贴图；[官方记录 API](https://zenodo.org/api/records/13380203) 显示 **CC BY-ND 4.0**，OBJ 93,770,353 B、主要贴图 17,298,393 B。因本项目需要减面、改材质与可能再分发，不纳入当前可改编候选。论文的 CC BY 或 napari 示例代码许可不能替代这份资产的 ND 条款。
- [Galapagos_3D — Zenodo](https://zenodo.org/records/14914807) 的[记录 API](https://zenodo.org/api/records/14914807) 为 CC BY 4.0，描述提及七个 3D 模型；但目前文件入口主要为 2.216 GB 分类图像数据包和 351.9 MB `FinalPointClouds.zip`。仅读取分类包前 128 KiB 中央目录样本，看到 train 图片条目，不能据描述确认「七份可导入、带 UV 贴图的三角网格」。没有下载完整包，也没有假设点云就是网格。
- [St Andrews 的 Lizard Island colony meshes](https://research-portal.st-andrews.ac.uk/en/datasets/tracking-morphological-development-in-stony-corals-colony-meshes/) 提供 285 MB ASCII PLY 网格包，并单独标明 CC BY；原位地点与 2018–2022 时间段明确。但 ReadMe 本次返回 403，单位、颜色／贴图、单体物种与面数尚未确认，故不列为可直接用于画面的强候选。
- [USGS Lower Florida Keys SfM 数据发布](https://coastal.er.usgs.gov/data-release/doi-P13HMEON/) 公布 5–14 GB 的各站 LAS 点云、GeoTIFF 正射影像及 DSM，不是现成 GLB／OBJ 网格。可用于地形重建研究，但不能假装直接取得了带贴图礁体模型。NOAA 官方影像／摄影测量方法文档同样不能替代具体资产文件与许可核实。

下一步建议：冻结测试结束后，在独立资产试验中只引入 A. cytherea 的 20k 版本作为死亡骨架环境层，保存来源许可与 hash，校验毫米换算、原尺度与底部接触，实际观察贴图和水下光照。导入及视觉验证完成前，本笔记不能作为「真实扫描已进入模拟」或「纪录片画面验收通过」的证据。

## USNM 229 的本地接入方案：只读代码检查

2026-10-03 追加。已阅读当前源码与本地 Three.js 0.186.1 的加载器实现；以下是待实施建议，没有下载扫描、执行解码、运行构建或修改源码。路径均相对于 `ocean-world`。

### 建议：本地 GLB 异步准备，然后同步构造世界

最低复杂度流程是：**取得本地 20k GLB 与本地 Draco 解码器 → 异步解码网格／贴图并校验 → 同步创建 ReefWorld → 挂入死亡骨架 → captureWorldResources → warmupPreallocatedResources → 记录初始资源清单 → 开始观察时钟**。异步加载发生在世界构造之前，因此新增扫描不会在正式运行中突然增加几何、贴图或材质程序。

- 本地已经具备 `three/addons/loaders/GLTFLoader.js`、`DRACOLoader.js`，以及 `node_modules/three/examples/jsm/libs/draco/gltf/` 下的 `draco_wasm_wrapper.js`（58,456 B）、`draco_decoder.wasm`（192,420 B）、`draco_decoder.js`（512,465 B）。无需另装解码包或使用外部 CDN。本地 Draco README 指向 [Apache 2.0 许可证](https://github.com/google/draco/blob/master/LICENSE)，复制运行时文件时保留其许可证及来源。
- 后续实现可把 GLB、来源 manifest 与解码器置于 `public/assets/`。Vite 的 public 文件复制流程可服务这些静态资源；发布路径按实际 `BASE_URL` 拼接，不能假设所有部署都位于域名根目录。解码器的目录形式 `setDecoderPath(...)` 需要目录中三份文件；本地 r186 也支持明确的 `{ js, wasm }` URL 对象。先用目录形式即可，`setWorkerLimit(1)` 足够处理一个样本。
- 通过 `new GLTFLoader().setDRACOLoader(draco).loadAsync(localUrl)`，或读取本地 GLB 后 `parseAsync(arrayBuffer, basePath)` 准备模型。`draco.preload()` 返回 loader 本身，**不是可 await 的完成屏障**；以 GLTF 的完成 Promise 为屏障，并显式检查几何 POSITION／NORMAL／UV、索引、两个预期贴图和非零图像尺寸。GLTFLoader 对部分贴图失败会返回 null，加载 Promise 成功不能代替贴图完整性检查。
- `src/OceanApp.jsx` 当前 effect 同步 `new ReefWorld(...)`；`src/main.jsx` 启用 React.StrictMode。改为 effect 内启动异步函数、effect 本身立即返回 cleanup；取消标记／代次标记防止 StrictMode 的第一次准备结果或切换生境后的迟到结果创建世界、覆写错误或 `window.__REEF__`。取消后如果加载已在进行，应等待它完成，再释放迟到资源；不能只丢弃 Promise。
- 新模块可返回 `preparedScan`（根对象、去重资源集合、图像集合、来源信息、准备耗时），传入 ReefWorld 的构造 options。只在 `biomeId === 'reef'` 时准备。当前 `src/world/ReefWorld.js` 第 104 行构造生境，第 125 行预热；接入点应在生境构造之后、首次 `captureWorldResources()` 之前。保存 `assetPreparationMs` 与现有 `initializationMs` 的不同计时范围，正式运行时钟仍从准备与预热完成后开始。
- Draco 的 `dispose()` 只终止 worker、撤销 worker Blob URL，不释放解析出来的资源。应在该次解析成功／失败已落定后调用；解码尚未结束就终止 worker 可能令等待结果无法返回。世界创建失败、准备校验失败与 effect 取消都必须覆盖资源清理。

### 坐标、单位、贴图与放置

该 GLB node 的矩阵是单位矩阵，而 manifest 中的摆放变换位于文件之外。建议准备阶段对每个唯一几何仅烘焙一次：

`p_m = 0.001 × (R(quaternion) × p_mm + translation_mm)`

即 **M = S(0.001) × T(manifest translation) × R(manifest quaternion)**。Three.js 中可以先用毫米 translation、原 quaternion 与单位 scale 组成 `T × R`，再在其左侧乘毫米到米的 scale 矩阵。不要用 `compose(t, q, 0.001)` 却仍传毫米 t：那样会漏缩放平移。完成后几何重新计算 boundingBox／boundingSphere，法线使用相应 normal matrix；mesh 的缩放保持 1。烘焙能去掉约 −85 米的原始坐标偏移，减轻浮点精度与包围盒问题。

再根据解码后实际包围盒与网格底部，将局部原点平移到适合放置的位置；记录这一步的平移和场景 placement。它只改变位置，不改变实物尺寸。核实上方向、实际脚点、封底／断面后选择硬底接触位置；不凭轴向 bounds 把 424 mm 当成世界高度，不擅自追加 90 度旋转，也不把约 62 cm 标本放大成米级景观。斜坡或分枝底部需要观察实际接触，单一 bbox 最低点不足以证明不会悬空。

两个 JPEG 在 GLB BIN 中，GLTFLoader 会从 bufferView 创建内部 Blob 并加载，正常成功路径会撤销这些 Blob URL；无需下载独立贴图，也不应另用教学页活体照片替换。保留 glTF 的 UV、贴图 channel、flipY 与色彩空间约定：baseColor 是 sRGB，occlusion 是线性数据。初次导入保留原始材质作对照，再记录任何金属度／粗糙度调整为渲染处理；不能称作生理测量或活体组织原色。

### 所有权与清理：一个世界内共享，最终释放一次

现有 `captureWorldResources()` 以 Set 收集几何、材质与材质中的贴图，但会整支跳过带 `userData.resources` 或 `userData.shared` 的对象，因为这些标记属于生物模块的私有引用计数。扫描应当是世界拥有的普通 Object3D；多个静态实例可以共享同一几何、材质、贴图，**不要给扫描套用这两个跳过标记，也不要混入 organisms.js 的私有资源缓存**。现有 `dispose()` 会对 world 的三个 Set 各释放一次。

必须补充 ImageBitmap 所有权：当前 world 的 `Texture.dispose()` 不调用 `ImageBitmap.close()`。GLTFLoader 在支持的浏览器中默认使用 ImageBitmapLoader，纹理克隆又可能共享同一 bitmap；准备阶段收集 texture.source.data／texture.image 中实际具备 close 的 bitmap 到独立 Set，GPU 贴图最终 dispose 后，每张 bitmap 只 close 一次。不能在移除第一个实例时关闭共享图像。首个样本无需跨世界缓存已解析对象；以后若做跨世界缓存，应由缓存自己维护租约与最后一个使用者释放，不能同时让 world Set 和缓存各自 dispose 同一资源。也不要将已关闭 bitmap 留在 Three.Cache 供后续场景使用。

准备结果需要明确的移交状态：`prepared → adopted → released`。建议 ReefWorld 在进入自身 try 的最开始就接管 preparedScan 的去重资源集合和 bitmap 集合，早于 WebGL 构造与挂载；此后即使构造失败，现有 catch→dispose 可以释放这些尚未挂场景的资源。调用方在取消或异常时只释放**尚未移交**的准备结果。这样既覆盖「构造尚未挂载就失败」，也避免「构造 catch 已 dispose，调用方又 dispose」的重复释放。World.dispose 保持幂等；准备模块的未移交释放也保持幂等。

此扫描属于环境层，不进入 `sim.agents`、物种数量、能量、可食资源或具名活体选择。挂入 decorations 时相机遮挡射线会看见它，但行为导航仍只知道 habitat 的现有代理；后续放置必须验证可通行体积与底栖接触，不能把真实网格当成自动获得了准确碰撞。

### 在线加载与离线转换的取舍

| 方式 | 启动依赖与预热安排 | 本次判断 |
| --- | --- | --- |
| 每次在线请求 Smithsonian GLB／远程解码器 | 依赖外网、CORS、服务器可用性；必须同样 await 后才创建世界 | 可用于资产试验，正式离线运行不采用此启动依赖；本次尚未核实完整 GET 的 CORS |
| 本地原始 GLB＋本地 Draco 运行时 | 浏览器从本站异步读取／解码，准备完成后同步构造世界；贴图随 GLB 内嵌 | **首个样本推荐**；离线指不依赖外网，仍需静态 HTTP 服务，不能据此保证 file:// 可用 |
| 预先离线解码为不压缩 GLB | 构建前转换；运行时不需要 Draco worker，但仍需读取文件及解码 JPEG | 可作为第二阶段优化；文件可能增大，坐标与贴图还须保留且重新核实 |
| 预先输出 literal typed arrays＋RGBA 像素模块 | JS 加载后可直接同步创建资源；脱离 GLTFLoader | 同步边界最强，但首样本实现／维护复杂且增加脚本与像素体积，暂不建议 |

离线解码的工具已在本地：Draco WASM wrapper 是 UMD，而 Three 包是 ESM；不能假设直接 import wrapper 会得到 Node 默认导出。可用明确的 CommonJS shim／vm 环境和本地 wasmBinary 初始化，再按 glTF `KHR_draco_mesh_compression.attributes` 的 **unique ID 映射**解码属性及索引，不能套用 POSITION／NORMAL 的默认顺序。重写 GLB 时按四字节对齐生成 accessor／bufferView，保留原有内嵌 JPEG 和纹理引用、移除已完成解码的 Draco 声明，另存派生文件并记录源文件 hash、变换与工具版本。现有 GLTFExporter 存在，但 Node 下贴图导出涉及 DOM／canvas 支持，未运行核实，不能承诺它可无额外处理地完成转换。

冻结结束并开始接入后仍须实际验证：完整 GLB 的 mesh／texture 内容、转换后的米制尺寸和朝向、原尺度近景、底部接触、阴影／孔隙、启动失败及 StrictMode 清理、切换生境资源释放、实际构建后断外网启动、初始／末尾 CPU 与 GPU 资源清单。新资产改变构建与性能负载，应生成新的构建 hash 和正式测试记录；review-three 的冻结结果只能归属原构建。

许可留存仍需在取得资产时补足：具体官方对象媒体及 FAQ 支持 public-domain／CC0 使用，但 manifest 通用版权文案存在不一致；保留其原文、具体媒体声明与核查时间，不把搜索索引称作完整许可档案。若随后读取的具体下载资产许可与对象媒体声明发生实质冲突，再向 Smithsonian 确认；当前不以第三方镜像补这个证据缺口。
