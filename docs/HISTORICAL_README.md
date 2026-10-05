# 潮汐 · 海底观察站

以海洋纪录片式写实为持续目标的本机3D海底探索与生态科普原型，已接入独立浅礁、海带林和3500m深海软底。当前开发版已降高九个主礁丘、重贴根点与死亡扫描，接入预分配景观LOD、前瞻聚焦遮挡、原尺寸块状珊瑚间距／单次岩心回退及512²组织贴图，选中环遵守深度遮挡。实际画面已保存，极近能看到杯孔点纹，但常规视距辨识不足，平滑盖面、管状枝冠、裸圆岩与人工桥仍显人工，整体视觉未通过。最新正式耐久仍为review-six原attached冻结版：1201.254实际秒／40窗、110–119移动活体、累计125.404 FPS，性能及严格资源计数通过；不覆盖当前开发改动。review-five／three历史通过、review-two资源失败和review-four捕获缺失保留，Goal保持active。

礁区有13个具名物种与1个藻膜功能群、78个初始生态实体；海带林有6个具名物种、46个初始生态单位，其中12个代表藻体；深海有海猪属、鼠尾鳕科和具名绒球海葵三个准入分类项、16个初始实体。属／科代理始终保留鉴定层级，深度范围重叠不证明它们来自同一次野外调查，也不支持本模型的数量比例。礁区景观珊瑚覆盖和海带柄／叶的形态抽样均为美术层，不额外增加生态个体或资源。

## 当前开发版 · 低礁丘与珊瑚细节

[低礁丘新契约](docs/REEF_LOW_MOUNDS.md)与[完整局部支撑证明](docs/REEF_LOW_MOUND_SUPPORT.md)记录九主礁冠部降至旧隆起的55.03–64.79%，31岩113,792面。旧高核心和历史rootY精确保留契约已终止；XZ、39,616个下壳三角、原扫描尺寸保留，根点及扫描按新硬底重贴。[局部复验](output/validation/reef-low-mound-support-v1-local-validation.json)19项不同检查最新结果通过，首批旧fixture失败与针对复验分别保留。

[LOD-v2](output/validation/reef-landscape-detail-v2.json)、[前瞻聚焦](output/validation/reef-landscape-focus-v2.json)、[块状支撑／间距整合](output/validation/low-mounds-cover-v2-world-integration.json)、[512²材质审计](output/validation/reef-massive-tissue-v2-material-audit-independent-corrected.json)和[模型／有限鱼点取样](output/validation/low-mounds-cover-v2/independent-validation-receipts.json)分别绑定其源码版本。块状候选保持原尺寸，仅失败时尝试一次岩心；这些证据不替代整鱼碰撞或同版本真实耐久。

[最终全景](output/validation/screenshots/reef-1791020997641-2026-10-03T09-49-57-731Z-559527c9.png)、[选中近景](output/validation/screenshots/reef-1791020335306-2026-10-03T09-38-55-526Z-9f4b38e5.png)与[极近景](output/validation/screenshots/reef-1791020556286-2026-10-03T09-42-36-406Z-fa355ab5.png)显示杯孔点纹存在，但常规视距辨识不足、形体仍显人工，视觉未通过。[构建／Sites收据](output/validation/low-mounds-cover-v2-build-receipt.json)记录126模块及4项测试通过，仅保存构建后源码hash；当前开发改动不继承review-six冻结耐久，Goal保持active。

## 运行
使用 Node.js 22 或更新的受支持版本。依赖由 package-lock.json 锁定。

```powershell
npm install --no-audit --no-fund --cache ../.npm-cache
node node_modules/vite/bin/vite.js --host 127.0.0.1 --port 4173 --strictPort
```

浏览器打开 http://127.0.0.1:4173/ 。开发服务仅绑定本机。开发版及明确启用的本机验证构建可将截图/记录写入项目；普通生产版使用浏览器下载。

冻结耐久验证用 `npm run build:validation -- review-next` 创建一个新名字的构建，再用 `node scripts/serve-validation-build.mjs review-next 4180` 服务。命令显式启用记录、核对捕获代码并保存清单，拒绝覆盖同名目录或清单。开始计时前，必须在实际浏览器确认截图和自动遥测都已保存；普通生产构建不能代替有记录的验证构建。

## 操作
- 左键拖动转动，右键拖动平移，滚轮靠近/远离。
- W/A/S/D 水平移动，Q/E 下潜/上浮，Shift 加速。
- 点击生物或从图鉴选择，查看档案并跟随。拖动视角退出跟随。
- 左侧生境菜单切换礁区、海带林与深海软底。全景及生境观察点切换机位，海带林另有冠层入口；暂停和 1/4/12/60 倍速调整模拟时钟。
- 礁区“骨架”机位观察约63cm宽的 USNM 229 死亡珊瑚骨架；这是馆藏 Dry 标本的原尺寸扫描，界面明确其身份，未加入活体图鉴或生态数量。
- 环境实验调整水流、相对浑浊、外部食物补给和时刻。比较时保持相同 seed，只改一个条件。
- 深海没有阳光、阳光焦散或光合输入；观察器照明开关仅用于看见相机附近的海床，不提供生态能量。深海时钟不形成太阳昼夜周期，悬浮海雪显示点不等于食物库存。
- 基线环境恢复参数，保留已经演化的生物状态。重置恢复初始群落和基线参数。
- 截图保存真实三维画面；开发环境写入 output/validation/screenshots/。
- 录像使用浏览器 MediaRecorder（WebM），当前每段最长45秒；实验导出为JSON。
- 生态演化工作台可切换独立的概念性礁区7池有机碳实验与匿名消费者出生队列实验，时间为180/365/730个模拟天。前者的补充生物量不是出生数；后者保留幼体／成体、结构／储备碳和连续预期个体密度。两者都不控制当前3D场景的个体数量。
- 出生队列工作台通过独立Worker计算同seed对照，提供食物输入、阶段食物可获得性和成体移除实验，导出实际参数、曲线及两本账目。界面数据接口、365/730天实际计算与导出已检查；580×871工作台实际滚动、导出和返回完成，没有横向溢出。

## 验证
```powershell
node --test tests/simulation.test.mjs tests/kelp-simulation.test.mjs tests/deep-simulation.test.mjs tests/population-experiment.test.mjs tests/age-structured-experiment.test.mjs tests/performance-workload.test.mjs
node scripts/run-experiments.mjs reef-next
node scripts/run-kelp-experiments.mjs
node scripts/run-deep-experiments.mjs
node scripts/run-population-experiments.mjs
node scripts/run-age-experiments.mjs
node scripts/inspect-fish-lod.mjs
node scripts/check-world-integration.mjs
node --test tests/reef-spatial-queries.test.mjs tests/reef-scan-assets.test.mjs tests/reef-scan-display.test.mjs tests/reef-scan-placement.test.mjs
npm run build
npm run test:sites
```

礁区实验命令需要尚未使用的报告子目录名，例如`reef-next`；运行前若目录内已有同名报告，脚本拒绝覆盖。再次验证时换一个新名字，保留所有历史成功与失败记录。

模型测试与实验报告不能替代实际浏览器视觉与长时间运行验证。1200 模拟秒的模型报告不代表浏览器连续运行20分钟。历史冻结礁区版本真实1080p运行1295.514秒的结果保存在[稳定性摘要](output/validation/browser-soak-summary.json)，只覆盖对应旧版hash；其旧FPS计时会裁剪慢帧，不作为最新性能门槛的证据。开发／验证版前25分钟每30秒保存实际浏览器采样，随后停止自动写盘；每次刷新为新run。

`review-one`冻结版本的120初始移动个体记录只完成609.015实际秒、20个间隔窗口，采样时116–120移动活体；窗口FPS均值31.95、最低11，[性能摘要](output/validation/performance-summary.json)的`fullRunTiming`为`null`。之后页面停止更新，停止后的墙钟时间没有计入。它不构成最新版本20分钟或完整逐帧性能验收。

鱼LOD的[Node几何检查](output/validation/fish-lod-smoke.json)通过：近景6个主渲染通道／4988三角形，远景3个通道／1252三角形；远景仍保留尾部运动和身体阴影。三生境的[世界集成检查](output/validation/world-integration-smoke.json)验证了地形延伸、候选视线、暂停、照明开关和资源释放，使用的是明确的渲染器／浏览器替身；这些报告不能证明实际GPU速度或画面已达到纪录片写实标准。

硬底珊瑚初始化与渲染共用`reefRockRelief`，床脚修订后的[48点支撑检查](output/validation/coral-bed-supported-inspection-v2.json)比较差值约−0.138至4.045mm，限定局部取样，不是逐枝或全网格精确碰撞。11项礁区测试、1项性能工作负载测试，以及[硬底修订12次实验](output/validation/coral-hard-substrate-v1/ocean-experiments.json)／[1200模拟秒耐久](output/validation/coral-hard-substrate-v1/model-soak.json)已完成，各报告绑定检查时源码，历史结果保留。海带弯曲柄和错列卷曲叶通过[共享形变检查](output/validation/kelp-canopy-shape-smoke.json)及12项模型测试；[kelp-canopy-v2完整实验](output/validation/kelp-canopy-v2/kelp-experiments.json)另存3种子×4条件×600模拟秒，72000步内没有局部摄食、非有限值或越界违规。强流食物终态的两负一正结果保留，未为趋势调参；这不是WebGL耐久证据。实际全景、冠层和5/5目标可见的小螺截图已保存，程序化形态与偏疏林冠继续改进。

已保存的[20项世界整合检查](output/validation/world-integration-smoke.json)还覆盖11块礁石264条床脚射线、88个相机支撑体积修正、旧首rAF／迟到回调不回退计时，以及扫描的合成资源所有权与释放。静态射线4项、扫描加载与取消13项、显示分割2项、放置2项测试通过；渲染器、Worker或图片解码替身的具体边界分别见测试与[扫描资产说明](docs/REEF_SCAN_ASSETS.md)。实际浏览器已经使用本地Draco／WASM和两个512²JPEG，并核对源hash，保存[排除人工底座后的扫描中景](output/validation/screenshots/reef-1791007337756-2026-10-03T06-02-17-878Z-c61d38b1.png)及[配对元数据](output/validation/telemetry/reef-1791007337756-metadata-2026-10-03T06-02-17-900Z-3b8880da.json)。本轮构建与Sites检查通过，仍不代表最新源码20分钟或整体视觉通过。

[实际对照板](output/validation/comparison.html)已加入[鱼LOD新近景](output/validation/screenshots/reef-1791000425429-2026-10-03T04-07-05-514Z-f681cd2d.png)，清洁虾岩隙图保留历史日期。[580×871窄屏观察](output/validation/browser-narrow-ui-observations.json)记录年龄面板539px／表格497px、三生境环境面板319px，均无横向溢出；实际滚动、导出及工作台返回已操作。该结果限定本次视口及输入方式，不覆盖所有设备或断点。

新增冠层入口后的580×871实际控制栏位于left16／right564、宽548px，4个观察机位及暂停、截图、录像按钮可见，页面无横向溢出。这是新增的实际操作观察，未另声称保存完整UI截图。

开发预览的三生境暂停检查（[礁区](output/validation/reef-browser-pause.json)、[海带林](output/validation/kelp-browser-pause.json)、[深海](output/validation/deep-browser-pause.json)）分别比较间隔58.698／107.964／74.801实际秒的两次静止机位捕获：PNG字节、代理／指标、相机和视觉时钟一致。该浏览器证据保留当时版本范围；当前[Node预热与资源检查](output/validation/world-warmup-pause-resource-smoke.json)验证离屏目标释放、状态恢复与CPU资源身份记账，属于20项世界整合检查中的相关部分。这些证据不替代连续画面、全内存分析或新冻结构建真实GPU严格20分钟检查。

绑定[review-two冻结清单](output/validation/review-two-build-manifest.json)的[正式20分钟性能摘要](output/validation/performance-review-two-20min.json)记录1237.772实际秒、1230.2模拟秒、41窗口，在RTX4070Laptop/ANGLE、1920×1080、DPR1下有112–120移动活体；未裁剪的全程累计104.978 FPS，最低窗口42 FPS，满足本机均值目标。启动2.696秒长帧仍保留，不能称为无卡顿。GPU几何90→95→115使[严格资源检查](output/validation/browser-soak-review-two-strict.json)和[缓存LOD评估](output/validation/browser-soak-review-two.json)均未通过。实际相机发生变化，逐窗遥测未记录相机／控制事件，因此不构成固定机位基线；新版本结果不覆盖此失败。

[review-three冻结清单](output/validation/review-three-build-manifest.json)保存6个文件，冻结前15项三生境整合检查、构建和Sites检查完成；正式run`browser-run-1791002656428`使用`serve-validation-build.mjs review-three 4178`。[90.190秒早期记录](output/validation/telemetry/browser-run-1791002656428-2026-10-03T04-45-46-622Z-6239ada2.json)继续保留，正式结论固定绑定[05:05:23 UTC原始源](output/validation/telemetry/browser-run-1791002656428-2026-10-03T05-05-23-012Z-01693176.json)。[性能报告](output/validation/performance-review-three-20min.json)与[严格耐久](output/validation/browser-soak-review-three-strict.json)均通过：1266.578实际秒、1260.1模拟秒、42窗，114–120移动活体，累计123.965364 FPS／最低窗口47；GPU几何122／纹理21、CPU几何122／材质53／纹理18的身份恒定，错误为空，最大账本误差4.167777×10⁻¹³、最大采样间隔34.579秒。各窗相机相同、OrbitControls开始事件0；此类离散记录不证明采样间绝无其他机位变化。磁盘与HTTP的6文件hash均与冻结清单一致。此前普通preview缺捕获接口的两段试运行未计入，之后的暂停／更晚遥测不替换正式报告原始源。

长帧保留为5帧超过1000ms、最长1387.504ms，均值达标不等于无卡顿。初始化1232.9ms／预热483.8ms是单独记录的CPU墙钟时间；累计帧间隔1267.717004秒比run墙钟多约1.139秒，不能断言已严格排除初始化重叠。稳定资源计数不是JavaScript堆或GPU显存无泄漏证明。上述结论只覆盖该冻结版与硬件，后续源码、跨设备表现和整体视觉另须验收。

[review-four失败尝试](output/validation/review-four-capture-disabled-attempt.json)漏编译捕获代码，服务器可达及22文件一致不能补足浏览器记录，其时间不计入后续run。

[review-five正式性能](output/validation/performance-review-five-20min.json)与[严格资源耐久](output/validation/browser-soak-review-five-strict.json)均通过，固定绑定run `browser-run-1791008975069` 的[06:49:36 UTC原始源](output/validation/telemetry/browser-run-1791008975069-2026-10-03T06-49-36-220Z-9022ca1f.json)。1201.133实际秒／1200.1模拟秒、40个30秒窗口，174980帧／1201.1227实际帧间隔秒，累计145.680370 FPS；窗口均值147、最低46、最高215，114–120移动活体、136分配实体、最终130活体。GPU几何123／纹理23、CPU几何123／材质54／纹理20身份恒定，错误为空，最大账本误差3.639311×10⁻¹³、最大采样间隔30.458秒。40窗为1920×1080／DPR1、可见、未暂停、1×，机位相同、控制开始事件0；离散检查点不能证明采样间绝无其他机位或状态变化。

[22文件清单](output/validation/review-five-build-manifest.json)与独立[运行前](output/validation/review-five-served-file-checks-before.json)／[运行后](output/validation/review-five-served-file-checks-after.json)磁盘和HTTP字节hash均吻合。固定源SHA-256为 `15429b3cef862d149f153b2d83f2f97973f3646e741c18fe43c428756d7a3560`，清单SHA-256为 `4670ce95162b613e8dd5fd45b387041da3aaee343926658126298d8c945b9a25`；[固定报告收据](output/validation/review-five-fixed-report-receipts.json)另存。[120秒初段](output/validation/performance-review-five-120sec-initial.json)及[开场捕获证据](output/validation/review-five-initial-capture-evidence.json)继续保留；后续暂停／更晚遥测不覆盖正式原始源。

最长实际帧间隔451.8ms，超过1000ms的帧为0，低速窗口全部保留。冻结包包含首rAF基线修复，run在世界初始化／预热后开始，墙钟与累计帧间隔差约10.3ms，未出现review-three约1.139秒的边界重叠。初始化2901.5ms／预热1413.9ms是CPU墙钟计时，无GPU计时查询；记录到零时长回调，未统计其次数。此结果不能扩展为无停顿、JavaScript堆或总GPU显存无泄漏、跨设备性能或当前开发源码视觉通过。

[580×420短屏骨架资料检查](output/validation/browser-skeleton-short-viewport-v1.json)来自实际CUA界面截图观察和只读DOM：资料面板scrollTop=80时来源链接位于面板内，8个底部控件可见，文档宽580px、没有横向溢出，错误为空。配对[580×420 PNG](output/validation/screenshots/reef-1791011294019-2026-10-03T07-08-14-031Z-54b81d11.png)与[metadata](output/validation/telemetry/reef-1791011294019-metadata-2026-10-03T07-08-14-050Z-c5aabf89.json)只保存三维canvas，不包含UI覆盖层；布局结论来自CUA观察，不以canvas图证明按钮或面板位置。结果仅覆盖本次视口、输入和当时源码，不代表所有断点、触屏或耐久通过。

[07:03三轴纹理初版全景](output/validation/screenshots/reef-1791011038542-2026-10-03T07-03-58-618Z-819317b2.png)与[metadata](output/validation/telemetry/reef-1791011038542-metadata-2026-10-03T07-03-58-639Z-2c6e9350.json)保留为中间版本：1920×1080／DPR约1、暂停、62移动活体，仍用weathered椭圆岩体和coral-v3。它不展示后来fractured岩体或coral-v3c，也不继承review-five正式耐久；整体视觉仍未通过。

[review-six正式性能](output/validation/performance-review-six-20min.json)与[严格资源耐久](output/validation/browser-soak-review-six-strict.json)均通过，固定绑定run `browser-run-1791014737160` 的[08:25:38 UTC原始源](output/validation/telemetry/browser-run-1791014737160-2026-10-03T08-25-38-437Z-d9d8782c.json)，SHA-256为 `d9c80157506f6062ee9a165a9103bf8f37cef3656a8b1acce4eb6333939ac84a`。1201.254实际秒／1200.2模拟秒、40个30秒窗口；150640帧／1201.239900实际帧间隔秒，累计125.403760 FPS，窗口均值122.875／最低75／最高181。110–119移动活体、136分配实体、最终126活体；GPU几何123／纹理24、CPU几何123／材质54／纹理21身份稳定，错误为空，最大账本误差2.815526×10⁻¹³、最大采样间隔30.877秒。40窗为1920×1080／DPR1、可见、未暂停1×、同一全景、控制开始事件0；逐窗帧数与累计帧间隔均增长。离散检查点不证明采样间绝无机位或状态变化。

[25文件清单](output/validation/review-six-build-manifest.json)SHA-256为 `89ee91a69056d7ce839834b456cbfdfd2e1665079fb960020dcd3c7d248a312a`，[运行前](output/validation/review-six-served-file-checks-before.json)和[运行后](output/validation/review-six-served-file-checks-after.json)磁盘／HTTP字节hash均与清单一致。[首次合格原始源锁](output/validation/review-six-first-eligible-raw-lock.json)及[固定报告收据](output/validation/review-six-fixed-report-receipts.json)另存；[120秒初段](output/validation/performance-review-six-120sec-initial.json)与[真实开场捕获证据](output/validation/review-six-initial-capture-evidence.json)保留，初段自身不是20分钟结论。所有慢帧窗口保留，最长416.8ms、>1000ms为0帧；零时长回调仍计帧，未记录其确切数量。初始化1636.9ms／预热339.2ms是包含同步驱动工作的CPU墙钟，未使用GPU计时器；运行／帧时钟从初始化及预热之后开始，首rAF基线保护包含在冻结包。墙钟与累计帧间隔差14.1ms，检查点最大差24.4ms。稳定计数不证明JavaScript堆、总显存字节无泄漏，也没有完整shader／driver诊断历史。

正式raw锁定后才操作页面并保存[08:29全景](output/validation/screenshots/reef-1791016154420-2026-10-03T08-29-14-493Z-d44e23a7.png)及[具名鹿角珊瑚聚焦近景](output/validation/screenshots/reef-1791016212425-2026-10-03T08-30-12-553Z-48b4cb9e.png)，配对[全景metadata](output/validation/telemetry/reef-1791016154420-metadata-2026-10-03T08-29-14-516Z-678b8224.json)、[近景metadata](output/validation/telemetry/reef-1791016212425-metadata-2026-10-03T08-30-12-597Z-7c5fb331.json)均为该冻结run、1920×1080／DPR1、暂停1415.7模拟秒、125活体／109移动活体、错误为空；聚焦staghorn-coral-6取样5/5可见。这些晚于正式源的暂停图不替换40窗耐久源。近景大面积裸岩、低细节枝形尖硬与底沿人工感仍明显，整体视觉未通过。review-six仅覆盖原attached冻结包；后续低礁丘、景观LOD／聚焦、块状放置及512²材质另有独立证据，不继承本冻结整包结论。review-five／three历史通过和review-two／four失败继续保留，Goal保持active。

08:00的[刚体贴底实际全景](output/validation/screenshots/reef-1791014439995-2026-10-03T08-00-40-186Z-37820614.png)及[metadata](output/validation/telemetry/reef-1791014439995-metadata-2026-10-03T08-00-40-227Z-34794b6f.json)属于普通run `browser-run-1791014321787`，78实体／62移动活体，暂停117.5模拟秒，错误为空。CSS1920×1080／DPR1.5，PNG实际2880×1620，不能称1080p渲染基准。巨大的悬空帽体已缩小并移到较平缓的岩体核心，按实际底层顶点作刚体贴底；岩基轮廓、材质及枝形仍显人工，整体视觉未通过。不同版本的状态、个体及像素尺寸未控制，不作严格A/B。

[刚体贴底说明](docs/REEF_LANDSCAPE_PLACEMENT.md)与[32候选报告](output/validation/reef-landscape-basal-fit-v1.json)检查31块实际硬底：16接受／16因缺少硬底拒绝；接受样本最大底层间隙−3mm、最深埋入81.384mm，冠顶高于已采样最高硬底至少197.716mm。只约束有限底层顶点，不证明完整底面接触、物理稳定或附着生物学。[attached-landscape-v2世界整合](output/validation/attached-landscape-v2-world-integration.json)通过21项Node检查，新增实际应用姿态的底层射线稍埋地；使用明确渲染器／控制／浏览器替身。World SHA-256 `5ee5bbb8ab25ed51cb67bfa5eceb5745f1a2ad8d044f7bd8360c597120c88481`，放置helper `8813b4ffc52b52a9d4c7a46f8364a6d1c0f3b2397ef050ae25fce757d09b3f49`，报告19个源码hash前后及冻结前那次磁盘核验一致；这些Node结果不代表真实GPU或视觉通过。普通生产构建成功（index-CvtxKBIL.js），4项Sites测试通过，未声称已发布。

新冻结review-six的[25文件清单](output/validation/review-six-build-manifest.json)SHA-256为 `89ee91a69056d7ce839834b456cbfdfd2e1665079fb960020dcd3c7d248a312a`；[构建收据](output/validation/review-six-build-receipt.json)显式启用捕获，bundle为index-CsLRNjtI.js，[运行前磁盘／HTTP检查](output/validation/review-six-served-file-checks-before.json)25项通过。独立run `browser-run-1791014737160`从08:05:37.160 UTC开始；[实际开场图](output/validation/screenshots/reef-1791014807916-2026-10-03T08-06-48-007Z-eff7b1ba.png)与[metadata](output/validation/telemetry/reef-1791014807916-metadata-2026-10-03T08-06-48-032Z-40f68595.json)为1920×1080／DPR1、未暂停、1×、控制开始事件0、固定全景；70.865实际秒时134活体／118移动活体、错误为空。已保存[30秒原始记录](output/validation/telemetry/browser-run-1791014737160-2026-10-03T08-06-07-189Z-ad90b316.json)与[60秒原始记录](output/validation/telemetry/browser-run-1791014737160-2026-10-03T08-06-37-187Z-393c8ddf.json)，帧计数3985→7938。这些是起始与初段证据，同run的首次合格固定源及正式20分钟结果另列上文，未以初段代替完整结论；后续开发源码不自动继承冻结结果。

07:45–07:51的[实际全景](output/validation/screenshots/reef-1791013547635-2026-10-03T07-45-47-728Z-f9879b12.png)与[浅礁中景](output/validation/screenshots/reef-1791013860221-2026-10-03T07-51-00-317Z-95c1b0aa.png)展示非对称岩肩、19块辅助岩同源硬底、coral-v4低细节端部／块状平面UV及本轮自然形态配色。配对[全景metadata](output/validation/telemetry/reef-1791013547635-metadata-2026-10-03T07-45-47-782Z-5a8f3c8d.json)和[中景metadata](output/validation/telemetry/reef-1791013860221-metadata-2026-10-03T07-51-00-349Z-ce45824f.json)属于run `browser-run-1791013406689`：1920×1080／DPR约1、78实体／62移动活体、暂停在140.2模拟秒、错误为空。岩肩和低细节形态已实际呈现，帽体与斜坡仍有明显悬空，整体视觉未通过；随后块状珊瑚刚体贴坡修订另行验证。这组图不是受控A/B、FPS或真实20分钟证据。几何与材质边界见[非对称岩肩说明](docs/REEF_ASYMMETRIC_SHOULDER.md)及[coral-v4说明](docs/CORAL_LOW_SURFACE_V4.md)。

本轮23项相关测试通过；[asymmetric-auxiliary-v1世界整合](output/validation/asymmetric-auxiliary-v1-world-integration.json)保存20项Node检查，含88处主岩与57处辅助岩相机修正、31个同源硬底，渲染器／控制／浏览器使用明确替身。报告绑定ReefWorld.js SHA-256 `062969820cb96748f0b174bd74e3a0da086c53c599c9c333f730967386ee3aaa` 与organisms.js `1bd30f3f59308f98abb124874b5bb3ba08a674870d95a4c4a6f4941a6f59403c`；之后World继续新增刚体贴坡，不能据此称整个后续源码通过。[辅助岩鱼根点检查](output/validation/reef-auxiliary-fish-contact-v1.json)分别运行seed42、77、2026各60模拟秒，实际辅助岩三角面射线命中共8609次，最小根点间隙0.122485619m；seed42的lined-tang-4初始根点原穿入47.986mm已修。它仅覆盖根点与有限取样，不证明整只动物或任意路径不穿模。

19块辅助岩进入共享高度后改变了轨迹；[asymmetric-auxiliary-v1新生态实验](output/validation/asymmetric-auxiliary-v1/ocean-experiments.json)另存seed1、42、2026×4条件×600模拟秒，12次均无不变量违规，15/15机制、21/21传统方向与6/6摄食方向检查通过。历史20/21方向记录仍保留，未为了方向一致调参。[同版纯模型耐久](output/validation/asymmetric-auxiliary-v1/model-soak.json)为seed42的1200模拟秒，最大资源账本误差5.035972×10⁻¹³、没有不变量违规；它不检验WebGL、FPS或实际浏览器20分钟。07:45–07:51这一批观察时尚无新构建／Sites或同版实际耐久结果；08:00后构建及review-six独立正式冻结结果另列，不改写这批历史模型证据或review-five结论。

新run `browser-run-1791011932167` 的[07:19全景](output/validation/screenshots/reef-1791011963367-2026-10-03T07-19-23-423Z-5370f1db.png)、[具名鹿角珊瑚聚焦中景](output/validation/screenshots/reef-1791012053555-2026-10-03T07-20-53-637Z-42acb6b6.png)、[单次前移后的近景](output/validation/screenshots/reef-1791012072268-2026-10-03T07-21-12-338Z-f1c3f4fb.png)及[骨架中景](output/validation/screenshots/reef-1791012123922-2026-10-03T07-22-04-048Z-0fbbc6ec.png)记录fractured断面岩体＋三轴纹理＋coral-v3c。各自[全景metadata](output/validation/telemetry/reef-1791011963367-metadata-2026-10-03T07-19-23-474Z-cafac276.json)、[珊瑚中景metadata](output/validation/telemetry/reef-1791012053555-metadata-2026-10-03T07-20-53-668Z-3219821c.json)、[近景metadata](output/validation/telemetry/reef-1791012072268-metadata-2026-10-03T07-21-12-383Z-ad813b34.json)及[骨架metadata](output/validation/telemetry/reef-1791012123922-metadata-2026-10-03T07-22-04-100Z-b41c0775.json)均为1920×1080／DPR约1、78实体／62移动活体、暂停在30.8模拟秒、错误为空；聚焦目标staghorn-coral-5取样5/5可见。它们是普通群落实际观察，不是耐久或受控FPS／视觉A/B。岩石UV拉伸改善且水平轮廓有断面，但圆帽和斜底座仍明显；具名枝壁更柔和，周围低细节分枝仍尖硬，块状珊瑚帽仍有严重UV拉伸，整体视觉未通过。其后低细节端部、块状珊瑚平面UV和独立地形方案继续修订，不以这组图宣称下一版通过。

[fractured-projection-v1世界整合](output/validation/fractured-projection-v1-world-integration.json)于07:12 UTC通过20项Node检查，使用明确渲染器／控制／浏览器替身；报告中organisms.js绑定 `cafdd148164a9907a0b20679607065c2c3de33651df9f5f74b173b20acc08339`，该模块随后已改变为v3c及后续修订。此结果不能称整个当前源码通过，也不能替代真实GPU或视觉证据。正式review-five固定版本范围保持不变。

## 科学与美术边界
见 docs/SCIENCE.md、docs/SOURCE_AUDIT.md 和 docs/TEXTURE_ASSETS.md。模型展示有资料支持的方向，但参数未按野外样方标定。资源为参考量，能量为归一化状态，浑浊度不是 NTU。三维模型、纹理、光照、焦散、地形和粒子是实时视觉近似，不是测量数据。视觉方向图位于 ../output/art-direction/。

本机性能入口 `http://127.0.0.1:4173/?performance=120` 使用120个初始可移动个体（加大雀鲷群），明确显示工作负载，不按野外密度校准、不补回死亡个体。正式记录需1080p并检查每个采样的移动活体至少100。

独立生境、形态尺寸和来源见[BIOMES.md](docs/BIOMES.md)、[KELP_MODEL.md](docs/KELP_MODEL.md)、[KELP_VALIDATION.md](docs/KELP_VALIDATION.md)与[DEEP_SEA_PLAN.md](docs/DEEP_SEA_PLAN.md)。长期实验边界见[LIFECYCLE_PLAN.md](docs/LIFECYCLE_PLAN.md)与[AGE_STRUCTURE_MODEL.md](docs/AGE_STRUCTURE_MODEL.md)。出生队列模型11项测试、20个365天案例与15个配对已完成；12个界面数据接口案例通过，模型结果与浏览器完成状态分别记录。

持续目标及未完成事项见 PLAN.md、PROGRESS.md 和 design-qa.md。

死亡骨架来源为Smithsonian的Acropora cytherea／USNM 229，具体媒体的公有领域声明与原manifest版权差异留在[资产说明](docs/REEF_SCAN_ASSETS.md)。原GLB不改写，显示裁去0.060m以下人工底座，UV、绕序与原尺度保留，切面未封底。review-five及早期20k图片显示19146面／22909顶点；当前150k Low细节和原文件身份另见[候选说明](docs/REEF_SCAN_DETAIL_CANDIDATE.md)。扫描不替代活体A. muricata，不增加物种、生态个体、食物或生物量。整体视觉尚未通过，Goal保持active。

review-five冻结之后的开发源码默认采用同标本150k Low与三张1024²JPEG（baseColor／occlusion／normal）。[06:54全景](output/validation/screenshots/reef-1791010465665-2026-10-03T06-54-25-760Z-eeadc298.png)、[06:55中景](output/validation/screenshots/reef-1791010526323-2026-10-03T06-55-26-431Z-feb954a3.png)和[06:55近景](output/validation/screenshots/reef-1791010557004-2026-10-03T06-55-57-121Z-0b5f000a.png)的真实metadata分别保存在[全景记录](output/validation/telemetry/reef-1791010465665-metadata-2026-10-03T06-54-25-789Z-845ea5dd.json)、[中景记录](output/validation/telemetry/reef-1791010526323-metadata-2026-10-03T06-55-26-471Z-7e573982.json)、[近景记录](output/validation/telemetry/reef-1791010557004-metadata-2026-10-03T06-55-57-177Z-54eb11e7.json)。CSS与PNG均1920×1080／DPR约1，暂停观察、普通群落62移动活体，错误为空；不能充当至少100移动活体的耐久工作负载。显示140772面／115927顶点，基部开放，比例为1，新放置位置[4.8,1.2788361,−4.8]m；该次顶点最小间隙4mm、最大271.773mm、19个近接触顶点，放置CPU查询299ms。它只约束取点，不证明完整三角接触、刚体稳定或野外共现。不同版本镜位、个体与模型状态未控制，图像不作为严格A/B。重复圆润礁石与尖硬程序化枝形仍需改进；这些早期图片之后已另存fractured／三轴／v3c实际画面，新低细节端部、块状平面UV及地形方案继续独立核验，均不继承review-five冻结耐久。

