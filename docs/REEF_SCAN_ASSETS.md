# USNM 229 死亡骨架扫描：本地资产与加载契约

日期：2026-10-03。已保存官方原始文件并实现独立加载模块及取消硬化。本子任务未运行构建或浏览器；Root 的场景集成与独立浏览器结果另行记录。本说明不属于 review-three 验证报告，也不代表最终画面、接触或性能已经验收。

## 资产身份与许可留存

Acropora cytherea，原发表名称 Madrepora cytherea，馆藏 USNM 229。Smithsonian 的[具体馆藏记录](https://www.si.edu/object/madrepora-cytherea%3Anmnhinvertebratezoology_13935) 显示 Preparation: Dry、Tahiti／Society Islands／French Polynesia、1838–1842 年采集。用于原尺度死亡骨架环境层；不能替代模拟中 A. muricata 的具名活体，也没有核实标本属于完整群体还是切取部分。

该官方对象的具体 3D media 声明为 public domain；[Open Access FAQ](https://www.si.edu/openaccess/faq) 解释标记为 CC0 的 3D 资产可修改、重用并列出 GLB／glTF 格式。当前网页证据来自官方内容的搜索索引，**不是完整网页离线存档**。`public/assets/reef-scan/license-evidence.json` 保存核查时间、具体媒体短声明、政策摘要和来源链接；`NOTICE.txt` 保存来源署名。此自包含 GLB 的两个内嵌 JPEG 随具体模型资产一并记录，教学页活体照片、网页注释和标志均不在本资产包内。

原始 Voyager manifest 的 `asset.copyright` 写有 “All rights reserved”，与具体对象媒体的公有领域声明不一致。原文和原文件均保留；当前使用依据为具体媒体声明及官方 Open Access 政策，不能称 manifest 也写了 CC0。若之后出现与具体媒体声明冲突的资产专属限制，需向 Smithsonian 确认。

## 本地文件

以下文件位于 `public/assets/reef-scan/`。下载和本地复制的确切时间见 receipts，文件 SHA-256 均按完整文件计算。

| 文件 | 字节 | 来源／SHA-256 |
| --- | ---: | --- |
| `usnm_229-20k-thumb.glb` | 323,096 | [官方原文件](https://3d-api.si.edu/content/document/3d_package:ad22ed7a-d030-4162-8880-e9cd65232514/usnm_229-20k-thumb.glb)；`c3ce125d357952ff1caa68efb920fcd4876d29459517d83b2de2a3aa211f8060` |
| `document.json` | 8,698 | [官方 manifest](https://3d-api.si.edu/content/document/3d_package:ad22ed7a-d030-4162-8880-e9cd65232514/document.json)；`a6332dc422504fc2793124b159301a5aa33a82096d0a591dcfd7fa1d704c8418` |
| `draco_wasm_wrapper.js` | 58,456 | 本地 Three 0.186.1 `examples/jsm/libs/draco/gltf/`；`8bb2952d2ba7d67e1414f8df819410cb0434a666be53f671fff75f68843d76f6` |
| `draco_decoder.wasm` | 192,420 | 同上；`a680d927bed9cb864ddbd63521868891af2bfbe755092761b4837487618df8ac` |
| `DRACO-README.md` | 1,395 | 本地 Three Draco README 的原样副本，说明 glTF 解码器及 Apache 2.0 许可 |
| `DRACO-LICENSE.txt` | 13,898 | [Draco 官方 LICENSE](https://raw.githubusercontent.com/google/draco/main/LICENSE) 的完整下载副本；`d3709b0fb4b8a94bbb1d02b8a2e484f258b0d9c5c5a01f940391f3fe662cd1a4` |
| `THREE-LICENSE.txt` | 1,081 | 本地 Three MIT 许可原样副本；`8b378ebe60e2fe500158cb0ac71cb5e8b7d92953c2abcc63a0eb90499653b5bc` |

GLB 下载始于 **2026-10-03T05:22:52.4909820Z**，manifest 始于 **05:22:53.8364662Z**；解码器复制于 **05:25:52Z**。其他附属文件为 `download-receipts.json`、`decoder-receipts.json`、`license-evidence.json` 与 `NOTICE.txt`。官网原始 GLB 和 manifest 没有改写；解码器也没有改写。Draco 的精确内部发行版本未独立核实，以 Three 包版本与完整文件 hash 固定该份运行时。

完整 GLB 的 JSON 头已读取：一个无变换 mesh node、一个 Draco 压缩三角 primitive、POSITION／NORMAL／UV、60,000 个索引、两个内嵌 JPEG bufferView；没有外部 buffer 或贴图 URI。这里的 20,000 面仍属于文件头声明，浏览器加载成功时会另记解码后的实际三角面数及图像尺寸。

Root 首次浏览器反馈原模型包含方形人工博物馆展示底座，不能直接放进自然海床。当前原始 GLB 保留该结构；本次取消硬化未更改几何或源文件。后续剔除明确人工底座的派生索引、保留面数／hash 与分割依据，由 Root 单独核查记录，不能把未处理的模型直接称为自然海底骨架。

## 模块契约与接入边界

模块：`src/world/reefScanAssets.js`。

```js
const bundle = await loadReefSkeletonScan({ signal }); // signal 可选
// bundle = { group, metadata, dispose }
// 在 World 初次 capture / prewarm 前挂入 bundle.group。
// World 最终清理、初始化失败或未接管的迟到结果必须调用：
bundle.dispose();
```

加载器从本站静态 `assets/reef-scan/` 读取 GLB／manifest，路径按 Vite `BASE_URL` 解析；Draco wrapper 和 WASM 也来自本站。没有运行时 CDN 或 Smithsonian 外网请求。仍需 HTTP 静态服务与支持 WebAssembly 的浏览器，不保证 file:// 能运行。提供两文件显式 URL 的 r186 Draco API，不需要额外下载 JS fallback。

当 Web Crypto 可用时，模块在解析前核对 GLB／manifest 的完整 SHA-256；不可用时 metadata 明确记录未执行运行时 hash 校验，下载 receipts 中的校验仍存在。始终核对 GLB 字节数、节点与内嵌图片结构及 manifest 单位／对应 20k derivative。

函数解析成功后检查所有顶点属性为有限值，法线／UV 存在、索引整数且不越界、材质数值有限、两个预期贴图图像尺寸非零，实际网格数为 1、三角面数为 20,000。两个贴图的实际 width／height、channel、flipY、colorSpace 写入 metadata。GLTFLoader 保留 glTF 贴图约定，不另做活体着色或从网页替换图片。

`group.userData.shared = true` 使当前 World 的 `captureWorldResources()` 跳过该根及子网格；未设置 organisms.js 的 `userData.resources`。**模块始终是几何、材质、贴图、bitmap 的唯一所有者，World 必须保留 bundle 并调用其 dispose，不能再加入 world 的资源 Set。** 同一 bundle.group 只能挂入一个父对象；首个接入只使用一个原尺度样本，未实现跨世界缓存或实例租约。

Root 接入时应在异步准备结果仍为当前 effect 代次时创建世界；React.StrictMode 或切换生境产生的迟到结果调用 bundle.dispose。World 应在构造失败可覆盖的位置保存 bundle 所有权，即使失败发生在模型挂入之前也要释放。不得在动画开始后异步加进初始资源清单。准备时间 `metadata.preparationMs` 与 World 初始化／GPU 预热时间分开保存，正式观察时钟从这些步骤结束后开始。

## 原尺度变换与 metadata

实际 manifest 单位为 mm，translation 为 `[123.4798433,85448.2661409,411.0341693]`，quaternion xyzw 为 `[-0.6996146,0.0894695,0.0890022,0.7032874]`。模块先将 quaternion 归一化为旋转，再在内存中烘焙：

`p_m = 0.001 × (R(q) × p_mm + t_mm)`

矩阵为 **S(0.001) × T(mm) × R(q)**，平移随顶点一起换算。原始约 −85,000 mm 坐标被抵消后，仅归中 XZ、将解码后包围盒 bottom Y 移到 0；没有等比放大，group scale 保持 1。唯一几何只处理一次，避免多个共享 mesh 重复烘焙。原文件仍保留原始毫米坐标。

metadata 记录原始／归一化 quaternion、translation、列主序矩阵、归中平移、变换后米制 bounds 和局部最终 bounds、实际顶点与三角面数、贴图尺寸、唯一资源数量、源 hash／许可来源及准备耗时。`physicalScaleMultiplier` 固定为 1，`placementAndContactValidated` 与 `visualAppearanceValidated` 当前为 false。包围盒 bottom=0 不等于已经验证真实脚点、封底、硬底接触或鱼类碰撞；这些需要实际解码观察后由场景接入完成。

## 释放、失败与取消

每次加载独立持有按对象身份去重的 geometry／material／texture／ImageBitmap Set。正常返回前释放 Draco worker，bundle.dispose 会停止重复释放、从父对象移除 group、释放 GPU 资源、逐个关闭共享 bitmap、撤销所跟踪的 Blob URL，并清空 group。单个释放动作报错不会阻止后续动作，错误保留在 `metadata.cleanupErrors` 中。

GLTFLoader 的插件钩子记录 texture／material／mesh；Draco 子类在实际解码 geometry 形成时登记，图片回调在 bitmap 形成时登记。每次准备使用专属 LoadingManager 和 AbortController；decoder wrapper／WASM 用专属 fetch，不参与 Three FileLoader 按 URL 跨实例合并，避免 StrictMode 第一次取消中断第二次加载。AbortSignal 只控制准备阶段，返回后资源清理由 bundle 所有者决定。

取消或任何加载失败立即终止并清理：中止独立库请求和图片 fetch，拒绝 worker 的待处理 callbacks，再终止 worker、撤销 Blob URL；解析／启动等待与取消 Promise 竞赛，不再无限等待兄弟任务。整个准备设 **30 秒 watchdog**，即使 worker 初始化 Promise 在内部拒绝、worker 静默不回答或图片解码永不回调，也会以 TimeoutError 拒绝函数并释放已经拥有的资源。创建已启动的 ImageBitmap 可能无法强行停止，关闭的 owner 会在其迟到时立即 close；迟到 geometry／material／texture 也立即 dispose，WeakSet 保证共享与迟到结果不会重复释放。

worker error／messageerror 会拒绝等待其结果的任务。额外 guard 覆盖 `_initDecoder` 完成后才出现的 Blob、`_getWorker` 的迟到 worker 与 taskCost、关闭后的 decode 投递，以及取消后已排队的消息；保留 callback／taskCost 字典供原始 `_releaseTask` 微任务删除，避免重复扣账。成功返回前的普通 worker 释放不会关闭该 bundle 的网格或图像。

以上跟踪依据本地 Three **0.186.1**：`decoderPending`、`_getWorker` 与 worker `_callbacks` 属于该版本加载器内部实现。未来升级 Three 时须重新核对这些清理钩子并运行真实浏览器验证。

## 已运行检查与仍待真实验证

已运行 `node --test tests/reef-scan-assets.test.mjs`，**13／13 通过**。验证了旋转／平移／单位顺序、约 85,400 mm 偏移消除、XZ 归中与 bottom=0、共享几何只变换一次、有限数值／节点放置拒绝、共享 bitmap 与 GPU 资源只释放一次、清理继续处理异常、预先取消在读取资源前拒绝；还核对了原始 GLB hash／Draco 声明／两个 JPEG 头中的 512² 尺寸。

取消硬化测试将**真实原始 GLB 交给实际 r186 GLTFParser**，Worker 消息和 JPEG 解码器为 mock，验证了解析中主动取消、worker 终止／callback 与 taskCost 清空、迟到图片只关闭一次、Blob 撤销、静默 worker 的 30 秒超时、库请求失败后挂起兄弟请求中止，以及同 URL 两次加载取消隔离。它们不称为真实 Draco 或 JPEG 解码测试。

本子任务尚未运行构建或浏览器。Root 的实际场景验证独立记录；本说明不据单元测试宣称浏览器、断外网、近景接触、真实 StrictMode／GPU 资源稳定或正式 soak 通过。review-three 现有 dist 和报告未被该资产任务修改。
