# 验证记录与适用边界

本文件汇总模型与实际浏览器证据。当前开发版已降高九个主礁丘、重贴根点与死亡扫描，接入预分配景观LOD、前瞻聚焦遮挡、原尺寸块状珊瑚间距／单次岩心回退及512²组织贴图，选中环遵守深度遮挡。实际画面已保存，极近能看到杯孔点纹，但常规视距辨识不足，平滑盖面、管状枝冠、裸圆岩与人工桥仍显人工，整体视觉未通过。**最新正式review-six原attached冻结版完成1201.254实际秒／40窗、1080p、110–119移动活体、累计125.404 FPS／最低窗口75，性能与严格资源计数通过。** 固定raw及25文件前后磁盘／HTTP身份保留；它不覆盖当前开发改动，Goal保持active。

## 验证状态

| 项目 | 已有结果 | 证据与边界 |
| --- | --- | --- |
| 当前低礁丘与重新贴底 | **19项不同检查最新结果通过** | [full证明](../output/validation/reef-low-mound-support-v1.json)／[复验](../output/validation/reef-low-mound-support-v1-local-validation.json)：31岩113,792面；48根点2.986300–5.549511mm；115,927扫描顶点≥4mm。首批fixture失败保留，非连续全场景碰撞 |
| 当前景观LOD／前瞻聚焦 | **8变体有界检查通过** | [LOD-v2](../output/validation/reef-landscape-detail-v2.json)各48转换／48迟滞／共享释放；[focus-v2](../output/validation/reef-landscape-focus-v2.json)候选／直线预判及隐藏树排除，构造器外CPU fixture，不是全浏览器路径 |
| low-mounds-cover-v2世界整合 | **21项Node检查通过** | [整合](../output/validation/low-mounds-cover-v2-world-integration.json)／[预热](../output/validation/low-mounds-cover-v2-world-warmup.json)：5株／360底层点最大−3mm、10对AABB最小1.292142m；World b8a56352…bac5d早于选中环深度标志 |
| 当前512²块状组织图 | **14项独立材质检查通过** | [修正审计](../output/validation/reef-massive-tissue-v2-material-audit-independent-corrected.json)：32杯／tile、身份／重复配置／释放／shader源码组合；[首审计辅助标记错误](../output/validation/reef-massive-tissue-v2-material-audit-independent.json)保留，未独立测GPU编译或显存 |
| low-mounds-cover-v2模型／鱼点取样 | **12案例／1200模拟秒／有限点检查通过** | [独立收据](../output/validation/low-mounds-cover-v2/independent-validation-receipts.json)：15机制／6摄食／21传统方向，账本5.546674×10⁻¹³；231,132根／鼻／尾点不是整鱼连续碰撞或实际20分钟 |
| 历史attached块状景观珊瑚刚体贴底 | **32候选检查与21项Node整合通过** | [候选报告](../output/validation/reef-landscape-basal-fit-v1.json)16接受／16缺硬底拒绝；[整合](../output/validation/attached-landscape-v2-world-integration.json)验证实际姿态底层点稍埋地，不证明完整底面／物理稳定 |
| review-six正式20分钟 | **1201.254实际秒／40窗，性能与严格资源计数通过** | [性能](../output/validation/performance-review-six-20min.json)、[严格耐久](../output/validation/browser-soak-review-six-strict.json)固定绑定08:25:38 UTC源；累计125.403760 FPS／最低窗口75，110–119移动活体，GPU123／24与CPU123／54／21稳定；仅原attached冻结包 |
| review-six历史起始与初段 | **25文件一致、真实捕获与30／60秒遥测已保存** | [构建收据](../output/validation/review-six-build-receipt.json)、[开场证据](../output/validation/review-six-initial-capture-evidence.json)、[120秒初段](../output/validation/performance-review-six-120sec-initial.json)只描述早期；完整结果另列，初段不是20分钟结论 |
| 历史非对称岩肩／辅助岩同源硬底／coral-v4检查 | **23项相关测试与20项Node整合通过** | [整合报告](../output/validation/asymmetric-auxiliary-v1-world-integration.json)绑定当时World／organisms；31同源硬底、88主岩＋57辅助岩相机修正；后续刚体贴坡不自动继承 |
| 辅助岩鱼根点取样 | **3seed各60模拟秒，通过** | [实际三角面射线报告](../output/validation/reef-auxiliary-fish-contact-v1.json)：8609命中、根点最小间隙0.122485619m；只约束根点与有限样本，不是整只动物碰撞 |
| asymmetric-auxiliary-v1生态实验 | **12次×600模拟秒、0不变量违规** | [新报告](../output/validation/asymmetric-auxiliary-v1/ocean-experiments.json)：15/15机制、21/21传统方向、6/6摄食方向；历史20/21保留 |
| asymmetric-auxiliary-v1纯模型耐久 | **1200模拟秒，通过** | [新数值报告](../output/validation/asymmetric-auxiliary-v1/model-soak.json)：最大账本误差5.035972×10⁻¹³；不是WebGL或实际20分钟 |
| 历史床脚硬底修订生态测试 | **11项礁区测试＋1项性能工作负载测试通过** | 当时硬底附着初始化；不等于后续源码或全网格碰撞证明 |
| 历史床脚硬底修订批量实验 | **12次运行，0个不变量违规** | [历史版本报告](../output/validation/coral-hard-substrate-v1/ocean-experiments.json)绑定当时源码hash；seed1、42、2026各600模拟秒，15机制与6摄食方向检查通过 |
| 直接机制检查 | **15/15** | 与终态条件分开；输入、资源、游泳成本、可见范围与累计初级生产 |
| 实际摄食方向观察 | **6/6** | 减少输入的 3 个 seed，实际累计浮游摄食与毛采食供能均降低；只代表本次配置 |
| 历史旧方向观察 | **20/21，未全部确认** | 旧地形中seed1的最终初始浮游摄食群条件出现真实反向，完整保留；新版21/21另列，不改写历史 |
| 历史纯模型耐久 | **1200模拟秒，通过** | 绑定当时源码；不是浏览器实际运行20分钟，新同源辅助岩结果另列 |
| 长期功能群测试 | **9/9 通过** | `tests/population-experiment.test.mjs`；含 5 seed 的 1825 模拟天运行、配对和有机碳账本 |
| 长期批量对照 | **20 次运行、15 组配对，通过数值与配对检查** | 5 seed，基线及三种干预，各 365 模拟天；干预在第 90 天 |
| 冻结构建浏览器观察 | **1295.514 实际秒，稳定性通过** | `browser-run-1790961416848`；1920×1080；43 个采样；旧冻结版本，不自动覆盖最新源码 |
| review-one 历史性能基准 | **609.015秒，采样均值31.95 FPS；未完成20分钟** | 1080p、20窗口、116–120移动活体；最低11 FPS；没有全程累计帧计时，不能称为稳定30 FPS或最终版本结果 |
| 独立深海模型 | **12项测试、12个600秒案例通过数值检查；实际场景已接入** | 3准入分类项；实际近景与观察灯开关已复核；不是同一野外调查共现或真实丰度 |
| 年龄结构模型 | **11项测试、20个365天案例与15配对** | 5 seed，167900步检查；有机碳与连续预期密度双账本；不是三维出生整数或具名种预测 |
| 生命周期实际界面 | **365／730天计算、曲线切换与JSON导出通过** | 实际浏览器操作，646643／1727169字节；干预前一致、碳账本检查通过；580×871工作台滚动、导出和返回已操作 |
| 指定窄屏布局 | **580×871实际复核通过** | [布局观察](../output/validation/browser-narrow-ui-observations.json)：年龄工作台面板539px／表格497px，三生境环境面板319px，均无横向溢出；不覆盖所有断点或触屏输入 |
| 三生境暂停画面 | **两次静止机位捕获一致** | [礁区](../output/validation/reef-browser-pause.json)、[海带林](../output/validation/kelp-browser-pause.json)、[深海](../output/validation/deep-browser-pause.json)分别间隔58.698／107.964／74.801实际秒；开发预览证据，不是连续像素流或内存分析 |
| 已保存的世界／预热与资源身份Node检查 | **20项世界检查通过，相关预热结果另存** | [世界检查](../output/validation/world-integration-smoke.json)、[预热检查](../output/validation/world-warmup-pause-resource-smoke.json)：床脚、相机、首rAF、合成扫描所有权与释放；替身渲染器不证明真实GPU20分钟稳定性 |
| review-two 性能复验 | **1237.772实际秒，本机均值性能目标满足** | [正式摘要](../output/validation/performance-review-two-20min.json)；1230.2模拟秒、41窗口、112–120移动活体；全程累计104.978 FPS，最低窗口42 FPS；相机变化，不能称为固定机位基线 |
| review-two 资源稳定性 | **严格检查与LOD解释评估均未通过** | [严格报告](../output/validation/browser-soak-review-two-strict.json)、[LOD评估](../output/validation/browser-soak-review-two.json)保留GPU几何90→95→115；新版本结果不覆盖这次失败 |
| review-three 历史早期检查点 | **90.190实际秒／3采样，保留初段记录** | [冻结清单](../output/validation/review-three-build-manifest.json)、[早期遥测](../output/validation/telemetry/browser-run-1791002656428-2026-10-03T04-45-46-622Z-6239ada2.json)；119–120移动活体，累计68.806 FPS；只描述前段，完整结果见下一行 |
| review-three 正式20分钟复验 | **1266.578实际秒／42窗，性能与严格资源检查通过** | [性能报告](../output/validation/performance-review-three-20min.json)、[严格耐久](../output/validation/browser-soak-review-three-strict.json)固定绑定05:05:23 UTC原始源；114–120移动活体，累计123.965364 FPS／最低窗口47，GPU几何122／纹理21、CPU122／53／18身份恒定；限定冻结版本 |
| review-four捕获缺失尝试 | **没有正式20分钟结论** | [失败记录](../output/validation/review-four-capture-disabled-attempt.json)保留冻结文件；服务可达不能补足浏览器记录 |
| review-five正式20分钟复验 | **1201.133实际秒／40窗，性能与严格资源检查通过** | [性能](../output/validation/performance-review-five-20min.json)、[严格耐久](../output/validation/browser-soak-review-five-strict.json)固定绑定06:49:36 UTC源；累计145.680370 FPS／最低窗口46，114–120移动活体，GPU123／23、CPU123／54／20身份恒定；当前源码不继承 |
| 后续静态射线与扫描测试 | **射线4项、加载13项、分割2项、放置2项通过** | 原尺寸变换、源面／UV／绕序、命中等价、取消与释放；加载测试的mock边界见[资产说明](REEF_SCAN_ASSETS.md)，真实浏览器解码另列下文 |
| 当前生产构建／Sites | **126模块构建与4项测试通过** | [收据](../output/validation/low-mounds-cover-v2-build-receipt.json)：index-Dk58vsL_.js、构建后源码hash；保留大bundle警告，不声称前后源码恒定、已发布或视觉通过。attached及review-six身份另存历史 |
| kelp-canopy-v2新版完整实验 | **3种子×4条件×600模拟秒通过数值检查** | [新版报告](../output/validation/kelp-canopy-v2/kelp-experiments.json)另存72000步／12项测试与未加观察对照，保留实际两负一正结果；不是浏览器20分钟 |

## 当前低礁丘／LOD／材质 · 独立证据

[低礁丘新契约](../docs/REEF_LOW_MOUNDS.md)与[完整局部支撑证明](../docs/REEF_LOW_MOUND_SUPPORT.md)记录九主礁冠部降至旧隆起的55.03–64.79%，31岩113,792面。旧高核心和历史rootY精确保留契约已终止；XZ、39,616个下壳三角、原扫描尺寸保留，根点及扫描按新硬底重贴。[局部复验](../output/validation/reef-low-mound-support-v1-local-validation.json)19项不同检查最新结果通过，首批旧fixture失败与针对复验分别保留。

[景观LOD-v2](../output/validation/reef-landscape-detail-v2.json)验证8变体各48转换／48迟滞及共享释放；[前瞻聚焦-v2](../output/validation/reef-landscape-focus-v2.json)按候选机位／直线路径预判LOD，排除隐藏树幽灵命中。块状候选保留原几何、随机尺寸和RNG，不支持时仅试一次岩心；支撑失败或AABB间距不足则省略。[21项世界整合](../output/validation/low-mounds-cover-v2-world-integration.json)记录5株、360底层射线最大间隙−3mm、10对AABB最小间距1.292142m，[预热与身份](../output/validation/low-mounds-cover-v2-world-warmup.json)另存。整合绑定World b8a56352…bac5d，早于选中环深度修订；Node替身与有限取样不证明GPU、完整接触或物理稳定。

共享块状组织Texture一次性替换为512²／32×32杯孔，米制周期[.21504,.192,.192]m、名义中心距[6.72,6,6]mm不变，间距随实例尺度变化；.0009只是显示凹凸增益。[独立材质审计](../output/validation/reef-massive-tissue-v2-material-audit-independent-corrected.json)14项通过：身份、重复配置、释放和shader源码组合。[首审计辅助标记记录](../output/validation/reef-massive-tissue-v2-material-audit-independent.json)保留；转义标记造成的审计shader收据由修正版替代，非应用shader缺陷。数组+1.5MiB、理想全mip链+2MiB为估算，未独立测GPU总显存、堆或GPU编译。

[模型／鱼点独立收据](../output/validation/low-mounds-cover-v2/independent-validation-receipts.json)绑定新共享地形和当时World b8a56352…bac5d：3seed／12案例各600模拟秒、0不变量违规，15机制／6摄食／21传统方向通过；1200模拟秒账本最大误差5.546674×10⁻¹³。3seed各60模拟秒的231,132个移动鱼根／鼻／尾点对真实三角取样，最小间隙.120247／.114703／.101777m；有限点取样不是整鱼或扫掠碰撞，不是浏览器20分钟。

[最终全景](../output/validation/screenshots/reef-1791020997641-2026-10-03T09-49-57-731Z-559527c9.png)、[选中近景](../output/validation/screenshots/reef-1791020335306-2026-10-03T09-38-55-526Z-9f4b38e5.png)和[极近景](../output/validation/screenshots/reef-1791020556286-2026-10-03T09-42-36-406Z-fa355ab5.png)属于普通seed42的最终run browser-run-1791020191510：暂停54.3模拟秒、1920×1080／DPR约1，staghorn-coral-2聚焦取样5/5；景观LOD为全景0近／114远、近景8／106、极近15／99，CPU130几何／54材质／21纹理身份稳定、errors为空。极近可见杯孔点纹，常规视距仍不足，视觉未通过。选中环depthTest=true，遮挡下局部可见；未选中图与此次环修订不证明所有白纹均来自环或已全部消失。PNG只含三维canvas，完整UI与开发控制台由主任务CUA观察，不从PNG推断。

配对元数据：[最终全景](../output/validation/telemetry/reef-1791020997641-metadata-2026-10-03T09-49-57-770Z-a35a6859.json)、[选中近景](../output/validation/telemetry/reef-1791020335306-metadata-2026-10-03T09-38-55-601Z-bafeb0a2.json)、[极近景](../output/validation/telemetry/reef-1791020556286-metadata-2026-10-03T09-42-36-450Z-ad9ab2f7.json)。早期[09:28全景](../output/validation/screenshots/reef-1791019718892-2026-10-03T09-28-39-000Z-1d5557e4.png)／[metadata](../output/validation/telemetry/reef-1791019718892-metadata-2026-10-03T09-28-39-050Z-885aa86c.json)、[09:31中景](../output/validation/screenshots/reef-1791019871342-2026-10-03T09-31-11-488Z-5586936b.png)／[metadata](../output/validation/telemetry/reef-1791019871342-metadata-2026-10-03T09-31-11-547Z-3db24ae6.json)、[09:36未选中近景](../output/validation/screenshots/reef-1791020184407-2026-10-03T09-36-24-602Z-a9a73617.png)／[metadata](../output/validation/telemetry/reef-1791020184407-metadata-2026-10-03T09-36-24-660Z-18744647.json)属于另一run、暂停146.1模拟秒；版本、机位、选择和状态不同，非受控A/B或性能对照。

[生产构建／Sites收据](../output/validation/low-mounds-cover-v2-build-receipt.json)记录126模块构建index-Dk58vsL_.js及4项Sites测试通过，保留bundle大于500kB警告；源码hash仅构建后观察，不声称构建前后恒定或已发布。当前World 53831eb5…5adf5含选中环深度修订，LOD／focus-v2另绑该版本。当前没有新正式20分钟或完整视觉通过；review-six原attached冻结版125.404 FPS及25文件身份保留，不能外推，Goal保持active。

## 实时生态模型：验证什么，保留什么

以下历史结果来自保留的 [ocean-experiments.json](../output/validation/ocean-experiments.json)，schema `tidal-model-experiments-v2`，绑定其中记录的旧源码hash；硬底附着修订结果另列下文。模型时间单位为模拟秒，内部固定步长 0.1 秒；资源为相对参考量，体能为 0–1 条件指数。它们没有换算成真实生物量、焦耳、水质浓度或野外预测。

三种单因素扰动分别为 `foodSupply: 0`、`currentMps: 0.8`、`turbidity: 1`，与相同 seed 的默认基线对照。脚本保存每 30 秒采样与终态，检查有限值、世界界限、地形附着、采食时间戳、资源非负、资源账本，以及旁路统计和账本的一致性。采样检查不是精确网格碰撞或所有连续轨迹的几何证明；鱼体净空等另由测试检查指定配置。

输入与摄食统计旁路观察原 `_input`、`_feed` 的实际结果，保留原返回值、随机调用与生态更新。没有另写一份摄食公式。种群体能同时输出：

- **全部初始群均值**：同一功能群的初始分母固定；死亡成员计零。
- **仅存活均值**：只计算现存成员，另报人数；没有存活者时为 `null`。
- **即时毛采食增量**：`_feed` 内部的条件增加，尚未扣除后续代谢、逃逸成本、裁剪或死亡；可以大于 1，不是净体能或真实能量。

`planktivoreCondition` 和 `fishCondition` 的旧字段一直是全部初始群口径，并非仅存活均值。seed 1 在 600 秒的结果为：

| seed 1 指标 | 基线 | 浮游输入为零 |
| --- | --- | --- |
| 累计外部浮游输入（参考资源量） | 1.08000 | 0 |
| 终态浮游资源（参考资源量） | 0.72047 | 0.02621 |
| 浮游摄食群累计真实摄入（参考资源量） | 0.46678 | 0.39219 |
| 累计毛采食条件增量（群体代理条件单位） | 8.40197 | 7.05947 |
| 全部 25 个初始成员条件均值 | **0.58042** | **0.58454** |
| 仅存活成员条件均值 | 0.65957 | 0.69588 |
| 存活 / 死亡 | 22 / 3 | 21 / 4 |

资源供给和实际摄食减少得到本次实验支持，“所有 seed 的最终净条件必然减少”没有得到支持。避敌、移动、寄生和捕食路径共同影响终态；仅凭这些汇总值不能锁定反向结果的独立原因。报告保留 `allLegacyDirectionsConfirmed: false` 和未确认项，模型未为方向一致性调参。

脚本退出状态检查数值不变量与明示的机制检查。退出成功不能改写为“全部 21 项生态方向通过”。另用未安装旁路的 seed 1 基线与减食模型核对，保存的完整指标和资源账本一致，确认观测包装没有改变结果。

`agent.lastFeedAt` 初始为 `null`；仅在 `_feed` 取到大于阈值的资源、且达到 `nextBite` 的离散采食事件时，记录当前模拟秒。`foraging` 等状态标签本身不触发它；空资源不会产生时间戳。该字段供摄食动作表现使用，不能作为野外摄食频率数据。

## 硬底附着与共享岩石表面修订

珊瑚初始化已改为附着硬底，模型与渲染共用`reefRockRelief`。[48点检查](../output/validation/coral-hard-substrate-inspection-v1.json)在6个seed的8株珊瑚上比较解析支撑高度与实际三角面取样，差值约−0.138至4.045mm；保留原有种子特征与随机状态。这是局部支撑取样，不能扩展为逐枝、全网格或连续轨迹精确碰撞。[实际硬底珊瑚截图](../output/validation/screenshots/reef-1791001808320-2026-10-03T04-30-08-427Z-53d897c9.png)另供画面审阅。

新源码对应的[12次生态实验](../output/validation/coral-hard-substrate-v1/ocean-experiments.json)有0个不变量违规，15/15直接机制与6/6摄食方向检查通过；本版本旧方向终态观察为21/21，历史版本的20/21反向结果仍完整保留，不以新结果覆盖旧报告或推断所有参数都单调。[1200模拟秒耐久](../output/validation/coral-hard-substrate-v1/model-soak.json)实际脚本执行4.638秒，实体78、最终活体71，最大参考账本误差5.520×10⁻¹³，不是浏览器墙钟耐久。

海带形态修订的[共享曲线检查](../output/validation/kelp-canopy-shape-smoke.json)覆盖48柄／2592叶、456192叶位置检查与1728接触取样；叶面接触最大差值约1.343mm。弯曲柄、错列下垂叶和卷曲为美术近似，12个代表藻体与资源容量未增加。12项当前海带模型测试通过；形变曲线改变了位置，历史完整海带实验保持旧hash。新版已另存[kelp-canopy-v2完整报告](../output/validation/kelp-canopy-v2/kelp-experiments.json)：3种子×4条件×600模拟秒、72000步、配对初态与加／不加观察终态一致，0个局部摄食／非有限值／越界违规。资源账本最大误差9.103829×10⁻¹³，相对状态残差4.590106×10⁻¹²；强流smallPrey终态差仍两负一正，高浑浊剩余食物更多、鱼状态更低，均保留，未为方向一致性调参。源码版本和旧／新差值见[KELP_VALIDATION.md](KELP_VALIDATION.md)。这些600秒及昼夜420秒均为模拟时间，不证明WebGL性能、浏览器耐久或林冠视觉通过。

## 纯模型 1200 秒耐久

保留的历史[model-soak.json](../output/validation/model-soak.json)记录 seed 42 的 **1200 模拟秒**，当次实际脚本执行约 **4.23 秒**。初始实体数 78，最终存活实体数 72；不变量违规为空，最大资源账本误差为 **`5.004885395010206e-13`**。新硬底修订版使用上节独立目录中的报告。

这里的账本仅检查四个参考资源池的程序加减，不是整个生态系统的真实质量、碳、氮或能量闭合。该报告不运行 WebGL，不检验帧率、GPU 内存、浏览器崩溃或浏览器实际 20 分钟稳定性。生态死亡与没有自动补回个体都是模型允许的结果，存活实体减少本身不是程序异常。

## 长期模型：独立的天尺度实验

[population-experiments.json](../output/validation/population-experiments.json) 对 seed **1、9、42、77、2026** 保存基线、高混浊、减少外部浮游生产者输入和持续移除捕食群，合计 **20 次运行、15 组配对**。每次 365 个模拟天，第 90 天干预；长期实验与实时秒尺度个体场景独立，30 天明确作为模型月，没有暗中倍速映射。

七个池是附着生产者、浮游生产者、草食群、浮游摄食群、捕食群、碎屑和分解群，统一单位为 `g 有机 C/m²`，固定步长 `0.05 day`。每次包含初始状态和 7300 个内部步的检查；逐日导出 366 个点。配对初始条件、干预前逐步状态及完整账本 hash、干预前逐日曲线均一致。数值违规为 0，最大有机碳预算误差为 **`3.590372443795786e-11 g C/m²`**；本次总有机碳实测数值范围为 **`8.553983452990723–120.43897618789617 g C/m²`**，不是程序强制上限。

该模型有外部有机输入、光合固定碳、呼吸、交换与移除输出，内部通量保持账本一致。它没有强制恢复平衡或自动补回缺失消费者。补充生物量只是同化碳的教学分配，未实现真实个体出生数、年龄、成熟延迟或物种寿命；无机碳、营养盐和氧气仍在模型边界外。

方向统计由实际配对差值生成。例如高混浊的 5 个 seed 均降低累计光合输入和第 365 天生产者量，但该日浮游摄食群反而高于基线，已如实保留。不能把某天的终态当成全过程单调或真实物种预测。5 个 seed 只扰动初始存量，不构成完整参数不确定性分析或野外预测置信区间。原始模型依据、参数单位、差值表和后续阶段见 [LIFECYCLE_PLAN.md](LIFECYCLE_PLAN.md)。

## 浏览器实际 20 分钟稳定性证据

已有真实文件分别保存在：

- 截图：[output/validation/screenshots](../output/validation/screenshots/)，例如 [17:17 截图](../output/validation/screenshots/reef-1790961436602-2026-10-02T17-17-16-650Z-711c0c60.png) 与 [17:31 截图](../output/validation/screenshots/reef-1790962319143-2026-10-02T17-31-59-302Z-90926686.png)。
- 录像：[output/validation/videos](../output/validation/videos/)，例如 [已保存 WebM](../output/validation/videos/reef-observation-1790962318757-2026-10-02T17-31-59-287Z-06522b65.webm)。
- 遥测：[output/validation/telemetry](../output/validation/telemetry/)；冻结资源清单与 hash：[frozen-build-manifest.json](../output/validation/frozen-build-manifest.json)。

截图和短录像用于审阅实际画面与运动表现，文件存在本身不等于全部视觉、交互或耐久要求已经通过。此处历史20分钟运行标识为 **`browser-run-1790961416848`**，开始时间 `2026-10-02T17:16:56.848Z`，视口 **1920×1080**，pixel ratio 约 1，硬件记录为 **NVIDIA GeForce RTX 4070 Laptop GPU / ANGLE Direct3D11**。它运行冻结的构建，不能自动覆盖之后修改的最新源码；最终结论应绑定冻结文件 hash。

最终检查点为 [17:38:32.370 UTC 遥测](../output/validation/telemetry/browser-run-1790961416848-2026-10-02T17-38-32-370Z-1bbaa29a.json)，摘要见 [browser-soak-summary.json](../output/validation/browser-soak-summary.json)。实际经过 **1295.514 秒（约 21.6 分钟）**，模拟经过 **1290.2 秒**；43 个 30 秒间隔采样均可见、未暂停、1 倍速。过程中切换镜头、录制短片，并做过短时夜间、水流、混浊和食物干预，因此这是交互观察工作负载，不能称为仅基线耐久实验。

采样 FPS 最低 **27**、平均 **131.67**、最高 **239**；记录到的运行错误和数值违规均为空，最大参考资源账本误差 **5.65×10^-13**。采样的几何资源首次选中时由157增至158（首次上传选择环），随后恒定；纹理资源恒定13，分配实体恒定78。初末采样存活数77→70，与生态捕食、死亡状态有关，没有自动补回。离开冻结页面前，最终 DOM 诊断为实际2254.237秒、模拟2246.7秒，错误列表仍为空；正式20分钟摘要使用上述已保存的1295秒完整采样文件。

这些是指定硬件与版本的离散观测，不是逐帧百分位 FPS、JavaScript 堆字节或 GPU 显存分析。稳定的渲染资源计数和有界数组支持本次未出现持续资源分配增长，不能扩展成所有内存都无泄漏的证明。后续资产与鱼LOD的review-two、资源预热的review-three结果另列下文；各冻结结论不自动覆盖其他生境或后续源码。

场景初始 **78 个总实体、62 个可移动个体（其中43条鱼）**；其余16个为固着珊瑚、砗磲和藻膜。遥测 `entities:78` 包含死亡后保留的渲染对象，不能解释成100个活动个体。独立性能工作负载的120个初始可移动个体不会自动补回死亡成员。

## 新的1080p移动活体测试

`review-one`冻结版本，run `browser-run-1790966015357`，最新有效完整遥测为609.015实际秒、600.4模拟秒，20个30秒间隔采样中有116–120移动活体，分配实体136。采样实际FPS窗口均值31.95、最低11、最高57；draw calls2028–3000，三角形1995728–2386280。错误列表为空，最大参考资源账本误差1.92×10^-13。记录见[performance-summary.json](../output/validation/performance-summary.json)，初始185秒报告另保存在performance-review-one-initial.json。

这一运行保持可见、不暂停、1×，由全景切至礁边；后台同时进行开发与模型验证。之后页面停止刷新，不能把停止后的墙钟时间计为连续观察，也不作同版本20分钟通过声明。该版本没有累计逐帧时间，31.95是离散窗口均值；最低11说明仍有卡顿风险。鱼LOD优化后的review-two已记录不裁剪的累计帧数/秒数与有界时间桶，结果如下。历史20分钟版本的FPS按裁剪后的间隔统计，慢帧可能被高估，不作为最新真实FPS目标的验收依据。

## review-two 冻结构建复验 · 性能满足，资源检查未通过

此轮性能复验绑定 [review-two-build-manifest.json](../output/validation/review-two-build-manifest.json)，运行标识 `browser-run-1790995698073`。早期记录见 [performance-review-two-initial.json](../output/validation/performance-review-two-initial.json)：**214.831实际秒、210模拟秒、7个窗口**，1920×1080、pixel ratio 1，同一 NVIDIA RTX 4070 Laptop / ANGLE 硬件。采样中116–120个移动活体，分配实体恒定136；累计实际帧数23669、实际帧间隔214.76244秒，**全程累计均值110.21 FPS**。窗口均值107.71、最低88、最高156 FPS；draw calls864–880，三角形1638552–1648008。错误和数值违规为空，最大参考资源账本误差8.22×10^-14。

累计帧计时没有裁剪慢帧，早期最大间隔约2.696秒；均值高不等于所有帧平滑。有界时间桶用于记录间隔分布，不是精确百分位分析。以上是初期检查点，完整结果见下文；性能 `passed:true` 不能改写为资源计数和整体稳定性已通过。旧版609秒与1295秒报告继续保留，不被本记录覆盖。

中间检查点[665.649秒记录](../output/validation/performance-review-two-10min.json)包含660模拟秒、22采样窗口、114–120移动活体，累计85225帧／665.58334秒，累计**128.05 FPS**，窗口均值132.86、最低74 FPS；最大参考账本误差2.58×10^-13，无记录错误或数值违规。早期GPU几何计数在32.706秒为90、214.831秒为95，此后至665.649秒保持95；纹理21、分配实体136保持不变。该检查点只描述前段；最终记录保留了756.059秒继续增加到115的变化。

[正式20分钟性能摘要](../output/validation/performance-review-two-20min.json)绑定[03:08:55 UTC遥测](../output/validation/telemetry/browser-run-1790995698073-2026-10-03T03-08-55-851Z-041ffbdf.json)：1237.772实际秒、1230.2模拟秒、41个30秒窗口；1920×1080、DPR1、可见、不暂停、1×，112–120移动活体，分配实体136。累计129932帧/1237.70444帧间隔秒=104.978 FPS；窗口最低42、均值106.10。最大实际帧间隔2.696秒保留；错误为空，最大参考资源账本误差3.493×10⁻¹³。本机本轮均值目标满足，不代表无停顿或跨设备承诺。

[严格报告](../output/validation/browser-soak-review-two-strict.json)因GPU几何90→95（214.831秒）→115（756.059秒）退出1，纹理21、实体136恒定。[缓存LOD评估](../output/validation/browser-soak-review-two.json)结合源码与Node世界几何证据，但未满足“上传变化在前300秒完成、随后稳定至少900秒”条件，也退出1。失败保留；延迟上传预先创建的细节几何与源码相符，具体首次使用物种未记录。后续预热、CPU资源身份计数和真实GPU复验继续进行。

开始和第1153.76秒的实际DOM机位不同，该版本逐样本遥测未保存相机或控制事件，不能称为全程固定全景基线。结果仅适用于本冻结构建、RTX4070Laptop/ANGLE及该次观察工作负载。

## review-three 冻结构建 · 正式20分钟结果与边界

[review-three清单](../output/validation/review-three-build-manifest.json)记录6个构建文件，正式服务为`node scripts/serve-validation-build.mjs review-three 4178`。此前4178普通preview缺少捕获接口的两段试运行未计入正式耐久；端口服务冲突已修正。正式run为`browser-run-1791002656428`，起点`2026-10-03T04:44:16.428Z`。

[90.190秒早期检查点](../output/validation/telemetry/browser-run-1791002656428-2026-10-03T04-45-46-622Z-6239ada2.json)保留3个采样，1920×1080、DPR1、可见、不暂停、1×，119–120移动活体；累计68.806 FPS，GPU几何122／纹理21、CPU资源身份一致，错误为空。相机与环境、跟随状态和控制事件已逐窗记账，前3窗控制事件为0。此初段记录本身不构成20分钟结论。[正式run首张全景](../output/validation/screenshots/reef-1791002718644-2026-10-03T04-45-18-742Z-a51de586.png)由[配对元数据](../output/validation/telemetry/reef-1791002718644-metadata-2026-10-03T04-45-18-762Z-d22e247a.json)绑定此run。

正式结论固定使用[05:05:23.012 UTC原始源](../output/validation/telemetry/browser-run-1791002656428-2026-10-03T05-05-23-012Z-01693176.json)，不以之后的暂停或更晚遥测替换。[性能报告](../output/validation/performance-review-three-20min.json)与[严格资源耐久报告](../output/validation/browser-soak-review-three-strict.json)均为`passed:true`：1266.578实际秒、1260.1模拟秒、42个30秒窗口，最大采样间隔34.579秒；每窗1920×1080、DPR1、可见、未暂停、1×，114–120移动活体。累计157153帧／1267.717004帧间隔秒，均值**123.965364 FPS**；窗口均值128.905、最低47、最高216。GPU几何122／纹理21、分配实体136恒定，CPU独立几何122／材质53／纹理18的身份与初始记录一致；错误和违规为空，最大参考账本误差4.167777×10⁻¹³。

该固定原始源的实际SHA-256为`b9f382cbd3bebf09eb391faddefc0cdb20bfe9f8655c0bb8f5fd7bd4cf80e2a5`，两份正式报告保存相同值；冻结清单SHA-256为`991297be16ddd836c529212cffb66359eb8d54ac02b6b0381b2c4e28dec7bdef`。当前源码和其他run的遥测不能替代这些身份。

42窗相机快照只有一种状态，OrbitControls开始事件计数保持0；这是离散检查点与该类控制事件证据，不能证明采样间绝无键盘或其他机位变化。环境参数和逐窗视口记录也保留其采样边界。6个冻结文件的磁盘与HTTP内容hash复核均与清单一致，校验时间和文件身份保存在两份正式报告；原review-two失败保持独立。

长帧与计时边界完整保留：有5帧超过1000ms，最长1387.504ms，均值达标不等于无卡顿。初始化1232.9ms、离屏上传与编译483.8ms单独记录为CPU墙钟时间，没有GPU计时查询。累计帧间隔1267.717004秒比run墙钟1266.578秒多约1.139秒，可能涉及首个rAF时间戳边界，不能断言已严格排除初始化重叠；原始数据保留，累计均值偏保守解读。稳定计数不等于JavaScript堆或GPU显存无泄漏证明。后续珊瑚细部、岩脚和首帧边界源码修订不包含在本冻结结论中。

## 较早实际画面与界面验证

[comparison.html](../output/validation/comparison.html)保留风格草案，并接入review-three正式首张全景、硬底附着珊瑚、[鱼LOD条纹倒吊近景](../output/validation/screenshots/reef-1791000425429-2026-10-03T04-07-05-514Z-f681cd2d.png)、[弯曲海带全景](../output/validation/screenshots/kelp-1791002120082-2026-10-03T04-35-20-165Z-94e88da5.png)、[冠层机位](../output/validation/screenshots/kelp-1791002142946-2026-10-03T04-35-42-981Z-1616d827.png)、[新叶面小螺](../output/validation/screenshots/kelp-1791002224152-2026-10-03T04-37-04-233Z-c7c690f7.png)、海胆居中、鼠尾鳕科／海猪属代理以及关灯全黑截图。新的小螺目标取样5/5可见，最新整合场景实际编译未记录错误。每幅原图标明保存时间，清洁虾岩隙及先前浅礁／海带形态图片保留历史日期。程序化形态、偏疏林冠、近景材质与接触／碰撞仍有视觉改进项；截图不能证明整体视觉已达标。

[browser-ui-exports-smoke.json](../output/validation/browser-ui-exports-smoke.json)核对可见界面产生的真实导出。seed42的365天停止食物与730天持续移除成体已在Worker计算、绘图并导出，文件大小分别646643与1727169字节；干预前曲线相同，碳预算误差分别约-2.65×10^-11与2.66×10^-11 g C/m²。非零的极低预期密度保留科学记数，不能称为严格灭绝。此处验证指定界面操作，不替代所有参数或模型科学校准。

[指定窄屏观察](../output/validation/browser-narrow-ui-observations.json)记录开发预览580×871视口：出生队列面板clientWidth／scrollWidth均539px，表格均497px；三生境环境面板均319px，页面均580px，没有横向溢出。实际滚动后已操作工作台导出、返回观察和各生境环境导出，导出文件保存在报告所列路径。该结果限定本次视口、输入方式和操作，不覆盖任意设备或全部断点。

新增冠层入口后，580×871实际控制栏边界为left16／right564、宽548px，4个观察机位以及暂停、截图和录像按钮可见，页面无横向溢出。此处追加实际浏览器观察，未声称另保存了完整UI截图。

三生境暂停复核分别见[礁区](../output/validation/reef-browser-pause.json)、[海带林](../output/validation/kelp-browser-pause.json)与[深海](../output/validation/deep-browser-pause.json)：同一静止机位的两次真实UI捕获间隔58.698、107.964、74.801实际秒，PNG字节相同；代理、指标、相机、视觉时钟和CPU资源身份保持一致。水面／焦散／颗粒使用独立视觉时钟后的暂停行为得到该版本开发预览支持；两帧比较不是连续像素流、全内存无泄漏证明或整体视觉达标结论。当前[Node预热与资源检查](../output/validation/world-warmup-pause-resource-smoke.json)另覆盖离屏目标释放、状态恢复和资源身份记账，使用渲染器替身，相关检查包含于20项世界整合；review-three真实GPU计数耐久由上节独立报告验证，后续源码仍须按版本复核。

深海观察灯在暂停模拟40秒时实际关闭／开启，关闭截图为全黑；两次导出的全部代理、三类食物、平均体能与摄食计数一致，自然光和累计光合输入均为0。该结果支持观察灯与生态状态分离，不是未暂停运行中生态完全不变的声明，也不等于整个深海光学已实测校准。

## 冻结后开发版：支撑、细部与死亡骨架扫描

[05:29礁区全景](../output/validation/screenshots/reef-1791005379224-2026-10-03T05-29-39-313Z-768ff53f.png)呈现新的床脚支撑；[05:33珊瑚近景](../output/validation/screenshots/reef-1791005608622-2026-10-03T05-33-28-685Z-dca649f3.png)呈现不规则枝径、分叉与杯口。11块支撑石264条实际网格射线和88处相机修正通过，第9块桥盖的岩隙保留；上表面仍与生态初始化共用，床脚版[48点检查](../output/validation/coral-bed-supported-inspection-v2.json)差值约−0.138至4.045mm。局部射线不证明所有表面、逐枝接触或连续碰撞。[珊瑚杯v2检查](../output/validation/coral-corallite-smoke-v2.json)检查生成几何与资源，交叉枝壳并非布尔并集；实际近景仍显程序化，未宣称视觉门槛通过。

首rAF和迟到回调的计时基线修复、静态BVH与扫描所有权接入后，[世界报告](../output/validation/world-integration-smoke.json)于05:59:16 UTC通过20项检查，绑定当时源码hash；预热和扫描接入检查使用渲染器与合成几何替身，不能作为真实GLB／GPU验证。当时静态射线4项、加载／取消13项、显示分割2项及放置2项测试通过。BVH只加于显式静态网格，验证最近命中、索引身份及释放，不将模型测试速度称为浏览器FPS；动态鱼虾／海带不套静态树。当时源码构建与Sites检查通过；后续冻结与150k变体不自动继承此检查身份。

## 新冻结运行与高精度扫描开发

[review-four失败尝试](../output/validation/review-four-capture-disabled-attempt.json)中，冻结JS没有捕获或遥测追加代码，未生成该run的自动记录。22个磁盘／HTTP文件一致与服务器捕获接口可达均不能补足浏览器运行记录。原尝试和冻结文件保留，没有生成20分钟通过报告。

review-five明确启用捕获，以新目录、[22文件清单](../output/validation/review-five-build-manifest.json)和run `browser-run-1791008975069` 从06:29:35.069 UTC重新计时，服务4180。实际PNG和首自动遥测核实后才开始监控；review-four时间未计入。

[review-five正式性能](../output/validation/performance-review-five-20min.json)与[严格资源耐久](../output/validation/browser-soak-review-five-strict.json)均通过，固定绑定run `browser-run-1791008975069` 的[06:49:36 UTC原始源](../output/validation/telemetry/browser-run-1791008975069-2026-10-03T06-49-36-220Z-9022ca1f.json)。1201.133实际秒／1200.1模拟秒、40个30秒窗口，174980帧／1201.1227实际帧间隔秒，累计145.680370 FPS；窗口均值147、最低46、最高215，114–120移动活体、136分配实体、最终130活体。GPU几何123／纹理23、CPU几何123／材质54／纹理20身份恒定，错误为空，最大账本误差3.639311×10⁻¹³、最大采样间隔30.458秒。40窗为1920×1080／DPR1、可见、未暂停、1×，机位相同、控制开始事件0；离散检查点不能证明采样间绝无其他机位或状态变化。

[22文件清单](../output/validation/review-five-build-manifest.json)与独立[运行前](../output/validation/review-five-served-file-checks-before.json)／[运行后](../output/validation/review-five-served-file-checks-after.json)磁盘和HTTP字节hash均吻合。固定源SHA-256为 `15429b3cef862d149f153b2d83f2f97973f3646e741c18fe43c428756d7a3560`，清单SHA-256为 `4670ce95162b613e8dd5fd45b387041da3aaee343926658126298d8c945b9a25`；[固定报告收据](../output/validation/review-five-fixed-report-receipts.json)另存。[120秒初段](../output/validation/performance-review-five-120sec-initial.json)及[开场捕获证据](../output/validation/review-five-initial-capture-evidence.json)继续保留；后续暂停／更晚遥测不覆盖正式原始源。

最长实际帧间隔451.8ms，超过1000ms的帧为0，低速窗口全部保留。冻结包包含首rAF基线修复，run在世界初始化／预热后开始，墙钟与累计帧间隔差约10.3ms，未出现review-three约1.139秒的边界重叠。初始化2901.5ms／预热1413.9ms是CPU墙钟计时，无GPU计时查询；记录到零时长回调，未统计其次数。此结果不能扩展为无停顿、JavaScript堆或总GPU显存无泄漏、跨设备性能或当前开发源码视觉通过。

后续开发加载器默认使用同馆藏150k／1024 Low，原20k及Medium候选保留。15项加载／取消检查包括原文件身份、3variant JPEG头部尺寸及新三图迟到结果清理；这些图片测试使用真实GLTFParser加模拟Worker／图片解码，不能替代浏览器WASM／JPEG路径；实际Low三图解码及捕获见下节。显示与放置共6项检查另执行实际本地Draco CPU解码，验证140,464原上方面完整保留及115,927显示顶点对实际岩石三角面的4mm间隙。详见[候选解码报告](../output/validation/reef-scan-detail-candidate-inspection-v1.json)、[候选说明](REEF_SCAN_DETAIL_CANDIDATE.md)。新源法线方向局限、开放基部、无完整三角接触／物理稳定保证和非野外共现边界继续保留；实际Low全中近景已在下节保存，当前非对称岩肩／三轴材质与coral-v4的视觉门槛仍未通过。

实际浏览器已使用本地Draco／WASM解码 Smithsonian 原尺寸 Acropora cytherea／USNM 229，核对GLB和manifest完整hash，并加载两个512²JPEG；身份为Dry死亡馆藏骨架，具体媒体公有领域声明和manifest版权文本差异见[扫描资产说明](REEF_SCAN_ASSETS.md)。[05:56原始底座图](../output/validation/screenshots/reef-1791006973168-2026-10-03T05-56-13-295Z-d9a54e4c.png)保留人工方形展示底座，是处理前失败画面，不能作自然海景成果。

原GLB文件不改写，内存显示于归一化0.060m裁掉底座，892个源面排除、70个源面裁剪，19038个上方面完整保留，总显示19146面／22909顶点；UV、绕序与原比例保留，基部切面未封底。[06:02去底座中景](../output/validation/screenshots/reef-1791007337756-2026-10-03T06-02-17-878Z-c61d38b1.png)由[配对元数据](../output/validation/telemetry/reef-1791007337756-metadata-2026-10-03T06-02-17-900Z-3b8880da.json)记录：宽0.626592m、显示高0.283271m、长0.411520m，比例乘数1，全部22909顶点对实际硬底的射线最小间隙4mm／最大285.587mm，8个近接触顶点。该判据只约束取样顶点，不证明整面接触、物理稳定、完整群体或野外共现；它不替代活体A. muricata，也不增加物种、生态个体、食物或生物量。

上述05:29床脚、05:33杯口及06:02早期20k图片的实际画布为1920×1080，CSS视口1280×720、DPR1.5；普通群落的观察画面不充当review-three的120移动个体性能工作负载。源扫描还保留未封底边界与馆藏干骨架材质，真实近景、取消／切换和最终画面继续复核。

## review-five之后的150k实际画面

review-five冻结之后的开发源码默认采用同标本150k Low与三张1024²JPEG（baseColor／occlusion／normal）。[06:54全景](../output/validation/screenshots/reef-1791010465665-2026-10-03T06-54-25-760Z-eeadc298.png)、[06:55中景](../output/validation/screenshots/reef-1791010526323-2026-10-03T06-55-26-431Z-feb954a3.png)和[06:55近景](../output/validation/screenshots/reef-1791010557004-2026-10-03T06-55-57-121Z-0b5f000a.png)的真实metadata分别保存在[全景记录](../output/validation/telemetry/reef-1791010465665-metadata-2026-10-03T06-54-25-789Z-845ea5dd.json)、[中景记录](../output/validation/telemetry/reef-1791010526323-metadata-2026-10-03T06-55-26-471Z-7e573982.json)、[近景记录](../output/validation/telemetry/reef-1791010557004-metadata-2026-10-03T06-55-57-177Z-54eb11e7.json)。CSS与PNG均1920×1080／DPR约1，暂停观察、普通群落62移动活体，错误为空；不能充当至少100移动活体的耐久工作负载。显示140772面／115927顶点，基部开放，比例为1，新放置位置[4.8,1.2788361,−4.8]m；该次顶点最小间隙4mm、最大271.773mm、19个近接触顶点，放置CPU查询299ms。它只约束取点，不证明完整三角接触、刚体稳定或野外共现。不同版本镜位、个体与模型状态未控制，图像不作为严格A/B。重复圆润礁石与尖硬程序化枝形仍需改进；这些早期图片之后已另存fractured／三轴／v3c实际画面，新低细节端部、块状平面UV及地形方案继续独立核验，均不继承review-five冻结耐久。

[580×420短屏骨架资料检查](../output/validation/browser-skeleton-short-viewport-v1.json)来自实际CUA界面截图观察和只读DOM：资料面板scrollTop=80时来源链接位于面板内，8个底部控件可见，文档宽580px、没有横向溢出，错误为空。配对[580×420 PNG](../output/validation/screenshots/reef-1791011294019-2026-10-03T07-08-14-031Z-54b81d11.png)与[metadata](../output/validation/telemetry/reef-1791011294019-metadata-2026-10-03T07-08-14-050Z-c5aabf89.json)只保存三维canvas，不包含UI覆盖层；布局结论来自CUA观察，不以canvas图证明按钮或面板位置。结果仅覆盖本次视口、输入和当时源码，不代表所有断点、触屏或耐久通过。

[07:03三轴纹理初版全景](../output/validation/screenshots/reef-1791011038542-2026-10-03T07-03-58-618Z-819317b2.png)与[metadata](../output/validation/telemetry/reef-1791011038542-metadata-2026-10-03T07-03-58-639Z-2c6e9350.json)保留为中间版本：1920×1080／DPR约1、暂停、62移动活体，仍用weathered椭圆岩体和coral-v3。它不展示后来fractured岩体或coral-v3c，也不继承review-five正式耐久；整体视觉仍未通过。

[review-six正式性能](../output/validation/performance-review-six-20min.json)与[严格资源耐久](../output/validation/browser-soak-review-six-strict.json)均通过，固定绑定run `browser-run-1791014737160` 的[08:25:38 UTC原始源](../output/validation/telemetry/browser-run-1791014737160-2026-10-03T08-25-38-437Z-d9d8782c.json)，SHA-256为 `d9c80157506f6062ee9a165a9103bf8f37cef3656a8b1acce4eb6333939ac84a`。1201.254实际秒／1200.2模拟秒、40个30秒窗口；150640帧／1201.239900实际帧间隔秒，累计125.403760 FPS，窗口均值122.875／最低75／最高181。110–119移动活体、136分配实体、最终126活体；GPU几何123／纹理24、CPU几何123／材质54／纹理21身份稳定，错误为空，最大账本误差2.815526×10⁻¹³、最大采样间隔30.877秒。40窗为1920×1080／DPR1、可见、未暂停1×、同一全景、控制开始事件0；逐窗帧数与累计帧间隔均增长。离散检查点不证明采样间绝无机位或状态变化。

[25文件清单](../output/validation/review-six-build-manifest.json)SHA-256为 `89ee91a69056d7ce839834b456cbfdfd2e1665079fb960020dcd3c7d248a312a`，[运行前](../output/validation/review-six-served-file-checks-before.json)和[运行后](../output/validation/review-six-served-file-checks-after.json)磁盘／HTTP字节hash均与清单一致。[首次合格原始源锁](../output/validation/review-six-first-eligible-raw-lock.json)及[固定报告收据](../output/validation/review-six-fixed-report-receipts.json)另存；[120秒初段](../output/validation/performance-review-six-120sec-initial.json)与[真实开场捕获证据](../output/validation/review-six-initial-capture-evidence.json)保留，初段自身不是20分钟结论。所有慢帧窗口保留，最长416.8ms、>1000ms为0帧；零时长回调仍计帧，未记录其确切数量。初始化1636.9ms／预热339.2ms是包含同步驱动工作的CPU墙钟，未使用GPU计时器；运行／帧时钟从初始化及预热之后开始，首rAF基线保护包含在冻结包。墙钟与累计帧间隔差14.1ms，检查点最大差24.4ms。稳定计数不证明JavaScript堆、总显存字节无泄漏，也没有完整shader／driver诊断历史。

正式raw锁定后才操作页面并保存[08:29全景](../output/validation/screenshots/reef-1791016154420-2026-10-03T08-29-14-493Z-d44e23a7.png)及[具名鹿角珊瑚聚焦近景](../output/validation/screenshots/reef-1791016212425-2026-10-03T08-30-12-553Z-48b4cb9e.png)，配对[全景metadata](../output/validation/telemetry/reef-1791016154420-metadata-2026-10-03T08-29-14-516Z-678b8224.json)、[近景metadata](../output/validation/telemetry/reef-1791016212425-metadata-2026-10-03T08-30-12-597Z-7c5fb331.json)均为该冻结run、1920×1080／DPR1、暂停1415.7模拟秒、125活体／109移动活体、错误为空；聚焦staghorn-coral-6取样5/5可见。这些晚于正式源的暂停图不替换40窗耐久源。近景大面积裸岩、低细节枝形尖硬与底沿人工感仍明显，整体视觉未通过。review-six仅覆盖原attached冻结包；后续低礁丘、景观LOD／聚焦、块状放置及512²材质另有独立证据，不继承本冻结整包结论。review-five／three历史通过和review-two／four失败继续保留，Goal保持active。

08:00的[刚体贴底实际全景](../output/validation/screenshots/reef-1791014439995-2026-10-03T08-00-40-186Z-37820614.png)及[metadata](../output/validation/telemetry/reef-1791014439995-metadata-2026-10-03T08-00-40-227Z-34794b6f.json)属于普通run `browser-run-1791014321787`，78实体／62移动活体，暂停117.5模拟秒，错误为空。CSS1920×1080／DPR1.5，PNG实际2880×1620，不能称1080p渲染基准。巨大的悬空帽体已缩小并移到较平缓的岩体核心，按实际底层顶点作刚体贴底；岩基轮廓、材质及枝形仍显人工，整体视觉未通过。不同版本的状态、个体及像素尺寸未控制，不作严格A/B。

[刚体贴底说明](REEF_LANDSCAPE_PLACEMENT.md)与[32候选报告](../output/validation/reef-landscape-basal-fit-v1.json)检查31块实际硬底：16接受／16因缺少硬底拒绝；接受样本最大底层间隙−3mm、最深埋入81.384mm，冠顶高于已采样最高硬底至少197.716mm。只约束有限底层顶点，不证明完整底面接触、物理稳定或附着生物学。[attached-landscape-v2世界整合](../output/validation/attached-landscape-v2-world-integration.json)通过21项Node检查，新增实际应用姿态的底层射线稍埋地；使用明确渲染器／控制／浏览器替身。World SHA-256 `5ee5bbb8ab25ed51cb67bfa5eceb5745f1a2ad8d044f7bd8360c597120c88481`，放置helper `8813b4ffc52b52a9d4c7a46f8364a6d1c0f3b2397ef050ae25fce757d09b3f49`，报告19个源码hash前后及冻结前那次磁盘核验一致；这些Node结果不代表真实GPU或视觉通过。普通生产构建成功（index-CvtxKBIL.js），4项Sites测试通过，未声称已发布。

新冻结review-six的[25文件清单](../output/validation/review-six-build-manifest.json)SHA-256为 `89ee91a69056d7ce839834b456cbfdfd2e1665079fb960020dcd3c7d248a312a`；[构建收据](../output/validation/review-six-build-receipt.json)显式启用捕获，bundle为index-CsLRNjtI.js，[运行前磁盘／HTTP检查](../output/validation/review-six-served-file-checks-before.json)25项通过。独立run `browser-run-1791014737160`从08:05:37.160 UTC开始；[实际开场图](../output/validation/screenshots/reef-1791014807916-2026-10-03T08-06-48-007Z-eff7b1ba.png)与[metadata](../output/validation/telemetry/reef-1791014807916-metadata-2026-10-03T08-06-48-032Z-40f68595.json)为1920×1080／DPR1、未暂停、1×、控制开始事件0、固定全景；70.865实际秒时134活体／118移动活体、错误为空。已保存[30秒原始记录](../output/validation/telemetry/browser-run-1791014737160-2026-10-03T08-06-07-189Z-ad90b316.json)与[60秒原始记录](../output/validation/telemetry/browser-run-1791014737160-2026-10-03T08-06-37-187Z-393c8ddf.json)，帧计数3985→7938。这些是起始与初段证据，同run的首次合格固定源及正式20分钟结果另列上文，未以初段代替完整结论；后续开发源码不自动继承冻结结果。

07:45–07:51的[实际全景](../output/validation/screenshots/reef-1791013547635-2026-10-03T07-45-47-728Z-f9879b12.png)与[浅礁中景](../output/validation/screenshots/reef-1791013860221-2026-10-03T07-51-00-317Z-95c1b0aa.png)展示非对称岩肩、19块辅助岩同源硬底、coral-v4低细节端部／块状平面UV及本轮自然形态配色。配对[全景metadata](../output/validation/telemetry/reef-1791013547635-metadata-2026-10-03T07-45-47-782Z-5a8f3c8d.json)和[中景metadata](../output/validation/telemetry/reef-1791013860221-metadata-2026-10-03T07-51-00-349Z-ce45824f.json)属于run `browser-run-1791013406689`：1920×1080／DPR约1、78实体／62移动活体、暂停在140.2模拟秒、错误为空。岩肩和低细节形态已实际呈现，帽体与斜坡仍有明显悬空，整体视觉未通过；随后块状珊瑚刚体贴坡修订另行验证。这组图不是受控A/B、FPS或真实20分钟证据。几何与材质边界见[非对称岩肩说明](REEF_ASYMMETRIC_SHOULDER.md)及[coral-v4说明](CORAL_LOW_SURFACE_V4.md)。

本轮23项相关测试通过；[asymmetric-auxiliary-v1世界整合](../output/validation/asymmetric-auxiliary-v1-world-integration.json)保存20项Node检查，含88处主岩与57处辅助岩相机修正、31个同源硬底，渲染器／控制／浏览器使用明确替身。报告绑定ReefWorld.js SHA-256 `062969820cb96748f0b174bd74e3a0da086c53c599c9c333f730967386ee3aaa` 与organisms.js `1bd30f3f59308f98abb124874b5bb3ba08a674870d95a4c4a6f4941a6f59403c`；之后World继续新增刚体贴坡，不能据此称整个后续源码通过。[辅助岩鱼根点检查](../output/validation/reef-auxiliary-fish-contact-v1.json)分别运行seed42、77、2026各60模拟秒，实际辅助岩三角面射线命中共8609次，最小根点间隙0.122485619m；seed42的lined-tang-4初始根点原穿入47.986mm已修。它仅覆盖根点与有限取样，不证明整只动物或任意路径不穿模。

19块辅助岩进入共享高度后改变了轨迹；[asymmetric-auxiliary-v1新生态实验](../output/validation/asymmetric-auxiliary-v1/ocean-experiments.json)另存seed1、42、2026×4条件×600模拟秒，12次均无不变量违规，15/15机制、21/21传统方向与6/6摄食方向检查通过。历史20/21方向记录仍保留，未为了方向一致调参。[同版纯模型耐久](../output/validation/asymmetric-auxiliary-v1/model-soak.json)为seed42的1200模拟秒，最大资源账本误差5.035972×10⁻¹³、没有不变量违规；它不检验WebGL、FPS或实际浏览器20分钟。07:45–07:51这一批观察时尚无新构建／Sites或同版实际耐久结果；08:00后构建及review-six独立正式冻结结果另列，不改写这批历史模型证据或review-five结论。

新run `browser-run-1791011932167` 的[07:19全景](../output/validation/screenshots/reef-1791011963367-2026-10-03T07-19-23-423Z-5370f1db.png)、[具名鹿角珊瑚聚焦中景](../output/validation/screenshots/reef-1791012053555-2026-10-03T07-20-53-637Z-42acb6b6.png)、[单次前移后的近景](../output/validation/screenshots/reef-1791012072268-2026-10-03T07-21-12-338Z-f1c3f4fb.png)及[骨架中景](../output/validation/screenshots/reef-1791012123922-2026-10-03T07-22-04-048Z-0fbbc6ec.png)记录fractured断面岩体＋三轴纹理＋coral-v3c。各自[全景metadata](../output/validation/telemetry/reef-1791011963367-metadata-2026-10-03T07-19-23-474Z-cafac276.json)、[珊瑚中景metadata](../output/validation/telemetry/reef-1791012053555-metadata-2026-10-03T07-20-53-668Z-3219821c.json)、[近景metadata](../output/validation/telemetry/reef-1791012072268-metadata-2026-10-03T07-21-12-383Z-ad813b34.json)及[骨架metadata](../output/validation/telemetry/reef-1791012123922-metadata-2026-10-03T07-22-04-100Z-b41c0775.json)均为1920×1080／DPR约1、78实体／62移动活体、暂停在30.8模拟秒、错误为空；聚焦目标staghorn-coral-5取样5/5可见。它们是普通群落实际观察，不是耐久或受控FPS／视觉A/B。岩石UV拉伸改善且水平轮廓有断面，但圆帽和斜底座仍明显；具名枝壁更柔和，周围低细节分枝仍尖硬，块状珊瑚帽仍有严重UV拉伸，整体视觉未通过。其后低细节端部、块状珊瑚平面UV和独立地形方案继续修订，不以这组图宣称下一版通过。

[fractured-projection-v1世界整合](../output/validation/fractured-projection-v1-world-integration.json)于07:12 UTC通过20项Node检查，使用明确渲染器／控制／浏览器替身；报告中organisms.js绑定 `cafdd148164a9907a0b20679607065c2c3de33651df9f5f74b173b20acc08339`，该模块随后已改变为v3c及后续修订。此结果不能称整个当前源码通过，也不能替代真实GPU或视觉证据。正式review-five固定版本范围保持不变。

## 重现命令与总体科学边界

在项目根目录执行：

```sh
node --test tests/simulation.test.mjs
node scripts/run-experiments.mjs reef-next
node --test tests/population-experiment.test.mjs
node scripts/run-population-experiments.mjs
```

批量脚本会重建相应 JSON 报告，保存生成时间和模型来源信息。单元测试的通过数来自已经完成的测试执行，复验时应以新的终端输出为准。

已验证程序在指定配置下的可重放性、非负性、账本与可解释反馈。review-five和review-three的独立冻结版本达到本机1080p、至少100移动活体的均值性能与严格资源计数目标；各自结论不覆盖后续源码，整体视觉仍未通过。尚未完成真实礁区校准、具名物种长期预测、精确流体／网格碰撞、完整营养盐／氧气／温度闭环、全生命周期或跨设备验证。物种来源和参数代理边界见[SCIENCE.md](SCIENCE.md)。

