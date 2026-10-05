# 视觉与交互验收

结果：**视觉未通过，开发继续，Goal保持active。** 当前常规视距下块状冠面偏塑料、杯孔辨识不足，枝形、裸圆岩与人工岩桥仍需改进。

## 方向与实际证据

- 用户确定：海洋纪录片式写实，自然光照、真实比例、安静观察；同时支持自由探索和可解释生态实验。
- 同一对照板：[comparison.html](output/validation/comparison.html)，包含风格草案、三生境实际全中近景、深海关灯对照与实际录像。原始图片保留，可点开全尺寸；每图标明时间，历史清洁虾岩隙证据与最新鱼类／全景分别注明。
- 参考仅为美术方向，生物身份和环境机制另见 SCIENCE.md；实际图片不使用参考图作为场景背景。
- 最新正式性能证据为review-six原attached冻结版，真实1201.254秒／40窗、累计125.404 FPS／最低窗口75与严格资源计数通过；[正式性能](output/validation/performance-review-six-20min.json)、[严格耐久](output/validation/browser-soak-review-six-strict.json)不覆盖当前低礁丘、景观LOD／前瞻聚焦、块状放置、512²材质与选中环深度源码。review-five／three历史通过与review-two／four失败保留，整体Goal保持active。
- 后续开发版新增[床脚全景](output/validation/screenshots/reef-1791005379224-2026-10-03T05-29-39-313Z-768ff53f.png)、[cup-v2近景](output/validation/screenshots/reef-1791005608622-2026-10-03T05-33-28-685Z-dca649f3.png)和[去人工底座死亡骨架中景](output/validation/screenshots/reef-1791007337756-2026-10-03T06-02-17-878Z-c61d38b1.png)。扫描身份为Dry／Acropora cytherea／USNM 229，原尺寸宽0.6266m，与模拟活体分开标注；[含人工底座的处理前截图](output/validation/screenshots/reef-1791006973168-2026-10-03T05-56-13-295Z-d9a54e4c.png)作为失败历史，不算自然海景成果。

review-five冻结之后的开发源码默认采用同标本150k Low与三张1024²JPEG（baseColor／occlusion／normal）。[06:54全景](output/validation/screenshots/reef-1791010465665-2026-10-03T06-54-25-760Z-eeadc298.png)、[06:55中景](output/validation/screenshots/reef-1791010526323-2026-10-03T06-55-26-431Z-feb954a3.png)和[06:55近景](output/validation/screenshots/reef-1791010557004-2026-10-03T06-55-57-121Z-0b5f000a.png)的真实metadata分别保存在[全景记录](output/validation/telemetry/reef-1791010465665-metadata-2026-10-03T06-54-25-789Z-845ea5dd.json)、[中景记录](output/validation/telemetry/reef-1791010526323-metadata-2026-10-03T06-55-26-471Z-7e573982.json)、[近景记录](output/validation/telemetry/reef-1791010557004-metadata-2026-10-03T06-55-57-177Z-54eb11e7.json)。CSS与PNG均1920×1080／DPR约1，暂停观察、普通群落62移动活体，错误为空；不能充当至少100移动活体的耐久工作负载。显示140772面／115927顶点，基部开放，比例为1，新放置位置[4.8,1.2788361,−4.8]m；该次顶点最小间隙4mm、最大271.773mm、19个近接触顶点，放置CPU查询299ms。它只约束取点，不证明完整三角接触、刚体稳定或野外共现。不同版本镜位、个体与模型状态未控制，图像不作为严格A/B。重复圆润礁石与尖硬程序化枝形仍需改进；这些早期图片之后已另存fractured／三轴／v3c实际画面，新低细节端部、块状平面UV及地形方案继续独立核验，均不继承review-five冻结耐久。

## 当前实际画面 · 低礁丘与512²组织图

[最终全景](output/validation/screenshots/reef-1791020997641-2026-10-03T09-49-57-731Z-559527c9.png)、[选中近景](output/validation/screenshots/reef-1791020335306-2026-10-03T09-38-55-526Z-9f4b38e5.png)和[极近景](output/validation/screenshots/reef-1791020556286-2026-10-03T09-42-36-406Z-fa355ab5.png)属于普通seed42的最终run browser-run-1791020191510：暂停54.3模拟秒、1920×1080／DPR约1，staghorn-coral-2聚焦取样5/5；景观LOD为全景0近／114远、近景8／106、极近15／99，CPU130几何／54材质／21纹理身份稳定、errors为空。极近可见杯孔点纹，常规视距仍不足，视觉未通过。选中环depthTest=true，遮挡下局部可见；未选中图与此次环修订不证明所有白纹均来自环或已全部消失。PNG只含三维canvas，完整UI与开发控制台由主任务CUA观察，不从PNG推断。

[低礁丘局部支撑](docs/REEF_LOW_MOUND_SUPPORT.md)、[LOD-v2](output/validation/reef-landscape-detail-v2.json)、[前瞻聚焦-v2](output/validation/reef-landscape-focus-v2.json)和[材质14项独立审计](output/validation/reef-massive-tissue-v2-material-audit-independent-corrected.json)各自范围明确。[构建收据](output/validation/low-mounds-cover-v2-build-receipt.json)仅为构建后源码观察，当前不继承review-six历史耐久或获得视觉通过。

## 发现与优先级

| 级别 | 发现 | 状态 |
| --- | --- | --- |
| P1 | 桌状珊瑚连续薄板，削弱自然礁区观感 | 实际全景确认已改为相连枝冠，cup-v2增加不等枝径、曲轴与凹杯口；当前近景仍显棱面、较硬质感及程序化排列，尚未达到纪录片参考 |
| P1 | 清洁虾跟随视角被固定相机最低高度抬高，主体落在画面下缘 | 实际近景主体已居中，红白背纹和尾扇白斑可辨；此项已修 |
| P1 | 海带林海胆被巨藻固着器遮住，选择环存在而主体不清楚 | 新机位实际近景已看见完整海胆，5/5目标采样可见；此项已修 |
| P2 | 部分鱼类近景被景观遮挡，几何接触还需检查 | 候选机位遮挡检查已接入；床脚版[48点局部支撑检查](output/validation/coral-bed-supported-inspection-v2.json)差值约−0.138至4.045mm；静态BVH核对最近命中与释放，尚不等于实际操作停顿或逐枝碰撞全面验收 |
| P2 | 主礁体接边与群体接触需持续检查 | 当前低礁丘保留39,616个下壳三角，264床脚射线及外缘入砂通过，根点／扫描重贴；5株块状底层点和AABB间距另存。有限支撑不代表完整接触、地质或连续碰撞 |
| P1 | 原始馆藏扫描含方形人工展示底座 | 处理前图保留，原GLB不变；显示裁去归一化0.060m以下区域，19038个完整上方面与原比例保留。去底座中景已保存，基部开放切面、近景放置及干骨架材质仍需审阅；不能将Dry标本充当活珊瑚 |
| P1 | 岩基、珊瑚造型与材质仍显人工 | 最终全景、选中近景和极近景已查看；杯孔点纹存在，常规视距辨识不足，平滑盖面、管状枝冠、裸圆岩和人工桥仍明显。优先做一个近景活珊瑚原型，强化枝径层级／连接融合／生长端／较大组织色斑，再改不规则岩棚并保留中央间隙，随后改善单礁丘覆盖构图 |
| P2 | 远景水体和礁体密度/材质尚未达到纪录片参考的层次 | 水色梯度与混合覆盖已接入，继续打磨 |
| P2 | 海带林冠偏疏、程序化排列及远缘仍需改进 | 延伸海床与雾色已接入；[共享形变检查](output/validation/kelp-canopy-shape-smoke.json)及[kelp-canopy-v2完整实验](output/validation/kelp-canopy-v2/kelp-experiments.json)完成，最新实际全景／冠层／小螺已保存；模型复验不代表完整浮动林冠，形态与近景材质继续打磨 |
| P2 | review-two历史长帧与GPU资源增长 | [review-two性能记录](output/validation/performance-review-two-20min.json)为1237.772实际秒、1230.2模拟秒、41窗口、112–120移动活体，累计104.978/最低窗口42 FPS，本机均值目标满足；启动2.696秒长帧保留。GPU几何90→95→115使[严格检查](output/validation/browser-soak-review-two-strict.json)与[LOD评估](output/validation/browser-soak-review-two.json)均未通过；相机变化且无逐窗机位字段，不能称为固定机位基线；原失败不被review-three通过覆盖 |
| P2 | 长帧与首帧计时边界 | review-six累计125.403760 FPS／最低窗口75，最长416.8ms／>1秒0帧，全部40窗口保留；初始化1636.9ms／预热339.2ms为CPU墙钟，运行从其后开始，wall-frame差14.1ms。旧review-three五帧>1秒及1.139秒边界差异继续保留；稳定资源计数不是堆／显存无泄漏证明 |

## 已实际操作的交互

- 当前staghorn-coral-2聚焦取样5/5，景观LOD从全景0近／114远到近景8／106、极近15／99，CPU130／54／21身份稳定。选中环depthTest=true，在遮挡下局部可见；不外推所有目标或白色纹路。

- 三维全景、物种图鉴选中、档案显示、条纹倒吊/清洁虾/绿光鳃雀鲷跟随。
- 暂停/继续，固定种子重建和模型确定性测试。三生境开发预览的静止机位双帧检查分别间隔58.698／107.964／74.801实际秒，PNG字节、代理／指标、相机和视觉时钟一致，见[礁区](output/validation/reef-browser-pause.json)、[海带林](output/validation/kelp-browser-pause.json)、[深海](output/validation/deep-browser-pause.json)；不扩展为连续像素流或全内存分析。
- 环境水流从 .15 到 .65 m/s：耗能项 .000023625 → .000443625；浑浊 .25 → .85：可见距离 6.16 → 2.34 m；食物输入可设为0。基线恢复保留演化状态。
- 夜间时刻设为0：光合输入0，选中雀鲷由活动转入隐蔽；保存录像及完整状态。
- 截图、3段实际 WebM 录像、实验 JSON 保存到 output/validation/，已读取实文件并用 ffprobe 检查容器/尺寸。
- 七池工作台已实际操作365天浑浊、seed2026的730天持续移除及180天停止光合、池切换和导出。580×871窗口工作台无横向溢出，固定返回按钮可见。
- 出生与成熟工作台使用独立Worker；12个数据接口案例通过，包含4种干预×180/365/730天，最大导出1.73MB。实际完成365天停止食物、730天持续移除成体、累计成熟曲线切换和导出；[实际JSON报告](output/validation/browser-ui-exports-smoke.json)通过。
- [580×871指定窄屏操作](output/validation/browser-narrow-ui-observations.json)完成：年龄面板539px／表格497px，三生境环境面板319px，均无横向溢出；实际滚动后导出与工作台返回完成。证据限定该视口和输入方式，不覆盖所有断点或触屏设备。
- 新增冠层入口后，580×871实际控制栏left16／right564、宽548px；4机位及暂停、截图、录像按钮可见，页面没有横向溢出。此项是追加实际浏览器观察，未另保存完整UI截图。
- 深海照明开关实际操作：关灯后画面全黑；同一暂停状态的全部代理、食物与摄食计数一致，太阳光和光合输入均为0。保留[开关对照报告](output/validation/browser-ui-exports-smoke.json)。
- 海胆新机位与约2cm叶面小螺已在实际浏览器观察并保存截图；深海鼠尾鳕科和海猪属代理近景及短录像已保存，属／科标签保留。

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

## 必须继续的验收

继续打磨珊瑚细部与材质、海带林冠疏密和程序化排列，复核扫描基部切面、近景和摄食动作与真实事件同步、触地与景观碰撞；整体视觉尚未通过。硬底初始化与共享`reefRockRelief`已接入，[硬底生态实验](output/validation/coral-hard-substrate-v1/ocean-experiments.json)及[纯模型耐久](output/validation/coral-hard-substrate-v1/model-soak.json)保留其源码版本。海带曲线修订的12项模型测试、形变检查和3种子×4条件×600模拟秒新版全实验已另存，反向终态保留，未调参强迫趋势。魚LOD近景、指定窄屏操作、冠层控制栏和三生境暂停双帧已执行。

review-two失败保留；6文件[review-three冻结清单](output/validation/review-three-build-manifest.json)已按磁盘及HTTP hash复核一致。[90.190秒初段](output/validation/telemetry/browser-run-1791002656428-2026-10-03T04-45-46-622Z-6239ada2.json)保留，正式20分钟结论固定用[05:05:23 UTC原始源](output/validation/telemetry/browser-run-1791002656428-2026-10-03T05-05-23-012Z-01693176.json)，不使用之后的暂停或更晚遥测覆盖。42窗相机一致、OrbitControls开始事件0；该记录不证明采样间绝无其他机位变化。资源计数耐久通过不等于堆／显存无泄漏或整体视觉达标。之后源码的[20项整合检查](output/validation/world-integration-smoke.json)、射线4项／加载13项／显示2项／放置2项测试与本轮构建／Sites检查通过，review-four捕获缺失尝试与review-five正式通过另列；当前源码不继承冻结结论。

骨架扫描实际浏览器元数据记录本地解码器、两个512²贴图、原文件hash、0.626592m宽和22909顶点4mm最小硬底间隙；裁剪是排除人工底座的美术处理，基部未封底。顶点间隙不证明整面接触、物理稳定、完整群体或野外共现，扫描不增加物种、生态个体、食物或生物量；来源及manifest版权差异见[资产说明](docs/REEF_SCAN_ASSETS.md)。

review-three初始化1232.9ms与预热483.8ms单独保存，但帧间隔1267.717004秒比run墙钟1266.578秒多约1.139秒，不能断言初始化已被严格排除；原始数据与正式冻结版本保持不变，后续首帧边界修订不包含在本次通过结论中。


[review-five正式性能](output/validation/performance-review-five-20min.json)与[严格资源耐久](output/validation/browser-soak-review-five-strict.json)均通过，固定绑定run `browser-run-1791008975069` 的[06:49:36 UTC原始源](output/validation/telemetry/browser-run-1791008975069-2026-10-03T06-49-36-220Z-9022ca1f.json)。1201.133实际秒／1200.1模拟秒、40个30秒窗口，174980帧／1201.1227实际帧间隔秒，累计145.680370 FPS；窗口均值147、最低46、最高215，114–120移动活体、136分配实体、最终130活体。GPU几何123／纹理23、CPU几何123／材质54／纹理20身份恒定，错误为空，最大账本误差3.639311×10⁻¹³、最大采样间隔30.458秒。40窗为1920×1080／DPR1、可见、未暂停、1×，机位相同、控制开始事件0；离散检查点不能证明采样间绝无其他机位或状态变化。

[22文件清单](output/validation/review-five-build-manifest.json)与独立[运行前](output/validation/review-five-served-file-checks-before.json)／[运行后](output/validation/review-five-served-file-checks-after.json)磁盘和HTTP字节hash均吻合。固定源SHA-256为 `15429b3cef862d149f153b2d83f2f97973f3646e741c18fe43c428756d7a3560`，清单SHA-256为 `4670ce95162b613e8dd5fd45b387041da3aaee343926658126298d8c945b9a25`；[固定报告收据](output/validation/review-five-fixed-report-receipts.json)另存。[120秒初段](output/validation/performance-review-five-120sec-initial.json)及[开场捕获证据](output/validation/review-five-initial-capture-evidence.json)继续保留；后续暂停／更晚遥测不覆盖正式原始源。

最长实际帧间隔451.8ms，超过1000ms的帧为0，低速窗口全部保留。冻结包包含首rAF基线修复，run在世界初始化／预热后开始，墙钟与累计帧间隔差约10.3ms，未出现review-three约1.139秒的边界重叠。初始化2901.5ms／预热1413.9ms是CPU墙钟计时，无GPU计时查询；记录到零时长回调，未统计其次数。此结果不能扩展为无停顿、JavaScript堆或总GPU显存无泄漏、跨设备性能或当前开发源码视觉通过。
