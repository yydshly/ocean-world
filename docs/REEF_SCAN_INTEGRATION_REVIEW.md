# 珊瑚骨架扫描接入独立审查

审查时间：2026-10-03。范围为当前加载器、显示裁剪、安放、静态射线树、World 所有权与 OceanApp 异步 effect。未修改运行源码，未接管 Root 的浏览器。

## 可行动问题

**加载期间的观察控件可以使 UI 与完成后的 World 状态不一致。** `OceanApp.jsx` 先清空 `world.current`／snapshot，再 await 扫描；观察点、暂停、速度及种子重置控件仍可使用。此时点击“骨架”或“暂停”只更新 React 状态，完成后的 World 仍从 wide、未暂停、1× 开始。应禁用依赖已准备 World 的控件，或显式应用加载期间保存的意图。该发现来自实际控制流检查，尚未做慢网络浏览器复现；不属于取消代次串场景。审查时已向 Root 报告，修复应另记来源与验证。

未发现当前正常路径中的比例重复应用、裁剪新面翻转、World／bundle 双重释放、取消结果误挂到下一生境或动态巨藻复用静态树问题。

## 几何与属性证据

运行 `node --test tests/reef-scan-assets.test.mjs tests/reef-scan-display.test.mjs tests/reef-scan-placement.test.mjs tests/reef-spatial-queries.test.mjs`，**21／21 通过**。真实源 GLB 的几何检查使用项目保留的原始 Draco wrapper 与 WASM 解码，不替代浏览器图片／Worker／GPU 验证。

- 源 GLB 为 20,000 面、23,488 顶点。裁剪排除 892 面、切分 70 个交叉原面、完整保留 19,038 个上方原面，结果 19,146 面、22,909 顶点。
- 19,038 个完整保留面逐面比较顶点、UV、法线及索引绕序；仅减去 0.060 m 的显示归中平移。交叉面沿边线性插值 UV／位置，插值法线重新归一化，三角化沿原多边形绕序。
- 独立实际解码统计：显示面零面积数 **0**，最小三角面积 **1.0018130447416755e−8 m²**；法线长度范围 **0.9999999574421324–1.0000000405758085**；UV 范围 U **0.001953125–0.9973171353340149**，V **0.001953125–0.998046875**。
- 577 个显示面的几何面法线与平均顶点法线方向相反；同样的 577 个面已存在于原始 19,038 个保留面中。原完整扫描共有 585 个此类面，70 个交叉面原本为 0。裁剪没有新增此类面；这属于原扫描局部品质限制，不能据本审查宣称源网格法线全局一致或完全流形。
- 矩阵顺序为 `S(0.001) × T(manifest-mm) × R(normalized-quaternion)`，应用正比例与旋转后仅归中，不改变绕序。显示宽／高／深 **0.6265922784805298／0.2832714319229126／0.4115196466445923 m**，group scale=1。人工底座切口未封口且明确记录；不宣称完整原生群体、活组织或测量附着面。

## 所有权与取消

扫描资源由每次加载的独立 owner 按对象身份去重。`group.userData.shared` 使 World capture 跳过它，World 的普通 owned Sets 不拥有扫描几何／材质／贴图；World dispose 调用 bundle.dispose，effect 的再次调用被幂等 disposer 吸收。CPU inventory 和预热仍遍历实际场景，因此包含扫描资源。

effect 使用局部 `cancelled` 和 AbortController；await 之后先检查代次，再同步创建并挂接 World。旧 snapshot／选中／错误回调检查 cancelled，清理仅删除它自己的 World ref／调试入口。JavaScript 同步构造段不会被另一个 effect cleanup 插入。解码器库请求不参与 Three FileLoader 的跨实例 URL 合并；专属 manager、30 s watchdog、关闭 owner 对迟到资源的立即释放覆盖解析失败与取消。

13 个加载器测试中，真实 r186 GLTFParser 解析原 GLB，Worker 消息和 JPEG 解码器使用 mock；取消、静默 worker 超时、错误库请求中止挂起兄弟请求、同 URL 加载隔离、迟到 bitmap／geometry／texture 的释放均通过。不能把这些 mock 成功扩展为真实浏览器反复切换或 GPU 内存稳定证明。ImageBitmap fetch 的 manager 中止依赖浏览器 `AbortSignal.any()`；不支持时，竞赛会结束准备且迟到资源仍释放，但不能保证底层图片请求当场结束。

## 静态树边界

实际 World 仅对 reef 合并硬底、reef 装饰珊瑚、具名 reef 珊瑚及已裁剪扫描启用静态树。巨藻、动物动画子树未被全局 Mesh 原型补丁影响。当前珊瑚没有顶点变形动画；对象位置／旋转／缩放可变，树仍使用局部坐标。扫描裁剪先完成，之后才建树。

树采用 indirect 模式，不改原索引；1,000 条实际礁体／珊瑚射线的最近网格、距离、点、faceIndex 与普通射线一致。几何 dispose 一次清除树，单个共享 Mesh 移除不会提前清除。以后若增加顶点位移、修改索引／groups／drawRange 或升级 Three，必须重新核对静态树契约；`StaticDrawUsage` 本身不能阻止业务代码改写位置。

## 读取的浏览器证据与科学边界

读取保留的 [06:08 原始遥测](../output/validation/telemetry/browser-run-1791007626276-2026-10-03T06-08-06-292Z-64101e0b.json)：GLB／manifest 运行时 SHA 均匹配下载留存；baseColor／AO 两张 JPEG 为 512²，channel=0、flipY=false；原扫描资源统计 1 geometry、2 materials、2 textures、2 bitmaps。实际显示裁剪为上述 19,146 面；安放采样 22,909 顶点，最小垂直间隙 0.004 m、8 个顶点距最小间隙不超过 1 mm，最大间隙 0.2855874842420123 m。

这份约 60 s 遥测 errors=[]，CPU inventory 123／54／20 与初始身份一致，只证明该短窗口；本审查不宣称新接入通过 20 分钟正式稳定性或跨设备性能。原尺度／每顶点垂直间隙不证明整个三角面无穿插、机械稳定、鱼类碰撞或当地共现。

metadata 保留原扫描 bounds／20k 面数，派生尺寸与显示面数写入独立 displayExcision，安放结果写入独立 placement；`placementAndContactValidated` 与 `visualAppearanceValidated` 仍为 false，应按准备阶段的保守标志理解。扫描在 UI 明示为馆藏干骨骼、人工底座排除和示意安放，不增加活体物种数，也不进入食物或生物量账本。

## 审查源码 SHA-256

下表固定本次读取时版本；Root 后续修改须另外验证，不能将本审查视为所有未来源码的证明。

| 文件 | SHA-256 |
| --- | --- |
| `src/world/reefScanAssets.js` | `584cc9ced595222c5411e5be67cd6476697fa84593c0493628f6fcdb70173833` |
| `src/world/reefScanDisplay.js` | `e77cd8b108e6ef7cd0fcc142e3c414dc7cd5f38dab905ef907bd4fb56fb72e3b` |
| `src/world/reefScanPlacement.js` | `e100c68575cee1ea86c16287aa3bc2de97f4217371577bab8707be21fd192d33` |
| `src/world/reefSpatialQueries.js` | `14e6fd229e1de493c353a8e853e8c7d40bc4b55439d1c939e036bccf00005f87` |
| `src/world/ReefWorld.js` | `8292b270e9903a7df569d48fca47a86e71736f4dba5a5b2af7f320d8f7b811fb` |
| `src/OceanApp.jsx` | `93f46d9a71b3a83b304c274b3dfdcc876d70b769bfd33e830f90d923b9db35cc` |
