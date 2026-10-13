# TIDAL · 海底世界

一个可以观看、探索和观察生命的浏览器海底原型。目标是自然光照、真实比例、丰富生境与安静观察的海洋纪录片式体验。**当前推荐从4分钟浅海体验开始：礁谷 → 沙道 → 草床，沿途观察动物群落，也可开启中文讲解或接管探索。**

[进入4分钟浅海体验](https://yydshly.github.io/ocean-world/?demo=shallow-journey&seed=55) · [阶段04实景前后对照](https://yydshly.github.io/ocean-world/overview/stage-04/) · [产品导览与全部入口](https://yydshly.github.io/ocean-world/overview/)

[![TIDAL 海底世界产品全景：目标、能力、生境、探索方法、实测结果与阶段边界](public/overview/ocean-world-product-atlas.png)](https://yydshly.github.io/ocean-world/overview/)

**点击上方原版引导图进入产品导览，再选择“4分钟浅海体验”。** 图中实景与数据是 **2026-10-12 的历史快照**，包括75秒样板和当时的性能、发布状态；最新阶段说明以本文与[阶段04对照页](https://yydshly.github.io/ocean-world/overview/stage-04/)为准。[下载原版长图](https://yydshly.github.io/ocean-world/overview/ocean-world-product-atlas.png)。

> **当前版本：阶段04 · 栖息地整合。** 本次发布范围包含293个动物个体、38个展示类别、240秒路线、六段中文讲解、三个浅海栖息地及两段过渡。本地场景基线为 `22987c4` / `stage-04-complete-habitats-local-20261013`。具体远端版本与部署状态以对应提交的 [GitHub Actions](https://github.com/yydshly/ocean-world/actions/workflows/pages.yml) 为准；详见[本次发布说明](docs/releases/STAGE_04_PUBLICATION.md)。

## 当前做到哪一步

| 阶段 | 已形成的能力与效果 | 阶段记录 |
| --- | --- | --- |
| 01 · 可演示原型 | 75秒浅海样板、持续探索世界、动物与生态观察工具、产品导览 | [原型归档](docs/stages/STAGE_01_OCEAN_PROTOTYPE.md) |
| 02 · 完整浅海路线 | 现有场景整合为4分钟、约90.1米的六段同景巡游；可接管探索；六段中文讲解、字幕及专注观看 | [路线](docs/stages/STAGE_02_SHALLOW_JOURNEY.md) · [讲解](docs/stages/STAGE_02_NARRATION.md) · [观看操作](docs/stages/STAGE_02_GUIDED_VIEW.md) |
| 03 · 群落与水层 | 关键动物呈现和生境活动整理；4组主鱼群形成上下、远近层次，底栖动物保留合理活动范围 | [生活群落](docs/stages/STAGE_03_LIVING_COMMUNITIES.md) · [水层构图](docs/stages/STAGE_03_WATER_COLUMN.md) |
| 04 · 栖息地整合 | 礁谷外围、沙道边界和连片草床整合；102只礁鱼、9只羊鱼、18只兔鱼的活动与实际通道、软底及草缘对应 | [范围、成果与验收](docs/stages/STAGE_04_COMPLETE_HABITATS.md) |

阶段04重组了24组礁体布局，6个底栖居民随宿主迁移；草床包含267簇核心与39簇边缘，连同保留草共332簇。24项布局记录以初始化场景为基准，**不是相对上一版新增24次可见变化**。293个体、38展示类、原资产与240秒路线保持，没有靠新增物种扩充本轮成果。

**整体视觉部分达成。** 连片草床和草缘活动变化最清楚，礁谷外围更有组织；开场近礁改善有限。扫描硬边、部分动物模型感、草叶重复和远处动物偏小仍保留。当前交付是可演示和有限探索的原型，尚未达到纪录片真实感。

## 先从哪里看

| 入口 | 用途 | 观看方式与范围 |
| --- | --- | --- |
| [4分钟浅海体验](https://yydshly.github.io/ocean-world/?demo=shallow-journey&seed=55) | **推荐主入口** | 礁谷 → 沙道 → 草床；293个体、38展示类；中文讲解、分段观看、可接管探索；阶段04已完成本机完整实播 |
| [阶段04前后对照](https://yydshly.github.io/ocean-world/overview/stage-04/) | 查看本轮实际变化 | 同路线五个时点的真实截图、完整播放结果和保留差距 |
| [产品导览](https://yydshly.github.io/ocean-world/overview/) | 了解产品全貌 | 目标、能力图、实景模块、生物目录、主要入口与验证证据 |
| [75秒浅海样板](https://yydshly.github.io/ocean-world/?demo=shallow-sample&seed=55) | 紧凑的历史样板 | 保留原冻结路线；阶段02—04的整合主要在4分钟入口，不能用此入口代替最新阶段 |
| [导演模式](https://yydshly.github.io/ocean-world/?demo=director&seed=55) | 范围探索：自动带看已有功能 | 67章，可选章、变速与接管；1×名义观察时长33分14秒，加载和转场另计；跨区等待仍是已知问题，本次不宣称全部67章完成新验收 |
| [生命巡游](https://yydshly.github.io/ocean-world/?demo=life-expedition&seed=55&world=whole-seabed) | 范围探索：连续生成海床 | 另一条240秒、约452米的路线；区域准备期间可能等待，与推荐4分钟浅海体验使用不同场景和验收范围 |
| [礁谷探索](https://yydshly.github.io/ocean-world/?demo=reef-valley-region&seed=55&world=whole-seabed) / [海草甸](https://yydshly.github.io/ocean-world/?demo=seagrass-meadow-region&seed=55&world=whole-seabed) | 自由走进浅海 | 按底质、水深和保存状态生成与延续群落 |
| [海带林](https://yydshly.github.io/ocean-world/?demo=kelp-life&seed=55) / [深海软底](https://yydshly.github.io/ocean-world/?demo=deep-life&seed=55) | 看不同生境 | 藻林分层生活、沉积海床与观察器照明 |

**4分钟浅海体验是当前集中建设和验收的主线，其余世界入口用于探索已有能力范围。** 样板中的动物数量、近景资产和播放表现，不能外推到持续探索世界或所有设备。

## 我们对产品的共同理解

我们要构建一片能让人安静观察、逐步探索并理解生命活动的海。长期方向是海洋纪录片式真实感；当前阶段交付可体验、可验证的原型。

- **先形成整体海底空间。** 礁坡、沙道、草床、光照层次和动物栖息空间应连贯，先验证完整镜头与巡游效果，再决定是否需要细节改进。
- **动物群落是核心。** 让水层鱼群、大型巡游动物、近底动物和附着生物有清楚的活动层次；丰富度体现在观察体验和行为上。
- **分布遵循生境条件。** 用水深、光照、底质、水流和活动净空约束出现位置。海草扎根沉积物、海带以固着器附着岩底；现有实现仍是有限近似。
- **探索持续，回访有记忆。** 按种子和坐标沿探索生成区域，保存当地个体和资源状态；当前卸载区域暂停演化，尚无全球离线演化。
- **用明确验收结束每个阶段。** 锁定范围，在本地验证后阶段性提交发布；已知差距如实归档，不自动触发无限优化。
- **保留素材来源与条件。** 只使用自制或免费且允许按条件再分发的素材，遵守署名、非商业和相同方式共享要求。

## 已实现的能力

| 方向 | 当前可体验内容 | 边界 |
| --- | --- | --- |
| 地形与景物 | 连续海床、不规则礁体、沙脊、礁脚碎石、草床与裸沙间隙；少量沉木和灌水沉底玻璃瓶 | 不是完整地质、水动力或砂粒输运模拟 |
| 水下环境 | 深度光衰减、雾与水色、焦散、悬浮颗粒、局部扬沙、植物随流摆动、深海观察灯 | 视觉与物理规则均为有限近似 |
| 动物与植被 | 水层鱼群、大型巡游动物、底栖动物、固定附着生物、珊瑚、海草及藻林 | 生物按生境出现，不是全部目录同时出生；形态与风格仍不统一 |
| 群落活动 | 浅海主线的礁间通行、羊鱼停走探底、兔鱼沿草缘游停及立体鱼群；探索世界中有群游、爬行、附着、海龟换气 | 主线主要采用确定性生境编排，不等于完整自主避碰或新食物网 |
| 生命与生态 | 探索世界中部分接触摄食、能量与资源收支、碎屑分解及捕食联系 | 使用相对食物代理；繁殖与完整食物网未实现，未经科研级校准 |
| 持续探索 | 种子和坐标决定按需生成的区域，近区加载与远区释放、相邻区后台准备 | 无预设水平场景墙，不代表有限设备能同时运行无限海域 |
| 回访与保存 | 探索世界的个体身份、当地资源与演化状态保存到本机；探索手记、标记位置和返回 | 卸载区暂停演化；无云同步，浏览器存储被清除后可能丢失 |
| 观看与讲解 | 主线六段中文语音、字幕、音量、倍速、暂停、章节、专注观看和接管探索 | 默认关闭语音，需主动开启；其它世界入口不自动继承此套讲解 |
| 观察与导出 | 探索世界中预设视角、点击档案、跟随、生物图鉴、环境实验、生态读数、截图、录像、数据导出 | 录像最长45秒且依赖浏览器支持；录像和截图仅含3D画面 |

### 生境与生物目录

| 生境 | 当前目录条目 | 已接入的代表内容 |
| --- | ---: | --- |
| 浅海礁区与草甸 | 106 | 礁鱼与鱼群、鲨魟与海龟、头足类、虾蟹螺、棘皮动物、珊瑚、海绵、贝类等 |
| 温带海带林 | 24 | 岩鱼、海藻鱼、豹鲨、鱿鱼、水母、海胆、海星、鲍、石鳖与3类藻体等 |
| 深海软底与水层 | 15 | 海猪、鼠尾鳕、海蜘蛛、海葵、蛇尾、海百合、黑珊瑚与中层游泳动物等 |

目录包含具名物种、科/属代表及藻类等不同层级，不等于145个精确鉴定的物种，也不等于同屏可见数量。完整清单见[导览附录](https://yydshly.github.io/ocean-world/overview/#appendix)或[结构化清单](public/overview/inventory.json)。

## 如何观察和探索

1. **先看完整浅海路线**：打开主入口，默认专注观看；展开控制可调整速度、暂停、选择章节或拖动0–240秒进度。建议先用1×看完三个栖息地及两段过渡。
2. **开启中文讲解**：点击“开启讲解”，从当前位置接上；可调音量、查看字幕、重听本段或从头讲解。无旁白时留白观察。
3. **走近群落**：点击“接管探索”，巡游与讲解暂停；使用界面方向控件或键盘移动。返回巡游后，镜头归位再接续。展开控制可查看当前入口支持的操作。
4. **继续探索世界**：选择生命巡游、导演章节或单独生境。自由移动使用`W A S D`、`Q / E`下潜/上浮、`Shift`加速；拖动转向、右键平移、滚轮靠近。导演可选章及0.5–4×速度，远距离入口会转场。
5. **观察一个个体或环境**：在探索世界点击生物，查看档案、尺寸、状态和可用的摄食记录，或跟随观察。在“环境实验”调整水流、浑浊、补给和观察时刻，对照当地资源与行为。
6. **留下记录**：探索手记可标记位置并返回；导出截图、录像或实验数据。文件由浏览器下载，注意实际下载结果。深海观察灯只改善可见性，不提供生态能量。

## 验证结果与已知差距

**最新阶段04的本机记录：** 原240秒路线正常1×播放，实际 **240.040秒**，无暂停、跳播或中断；六段讲解均出现实际播放事件，无语音错误或阻塞，控制台error/warn为空。

| 指标 | 本地实测与口径 |
| --- | --- |
| 检查范围 | 32项相关检查通过，非全库测试 |
| 画面环境 | 1280×720、DPR约1、RTX 4070 Laptop、WebGL2；渲染比例始终1 |
| 帧间隔 | p95为12.5ms，最大133.3ms；单次记录，不代表全设备稳定60 FPS |
| 导航至准备完成 | 3.949秒，**已有缓存的本地访问**；不能据此宣布公网冷加载5秒达标 |
| 场景与镜头 | 身份数量、宿主支撑、贴地、相机净空及连续性检查通过；961个相机位置采样沿用原路线 |
| 视觉结果 | 草床改善清楚，开场近礁改善有限；五时点对照和全程播放记录保留 |

完整说明见[阶段04验收](docs/stages/STAGE_04_COMPLETE_HABITATS.md)及[结构化摘要](docs/validation/stage-04-complete-habitats-20261013.json)。本轮远端构建和发布检查，以对应提交的Actions日志及实际站点验证为准。

- **真实感仍有差距：** 扫描硬边、重复冠体与草叶、旧动物模型感、远处小动物不突出。阶段归档不等于纪录片级画质验收。
- **性能不能跨范围外推：** 4分钟主线不经过持续世界的跨区加载；导演和生命巡游的准备等待仍需单独看待。本轮没有重新完整验收全部67个导演章节、手机实机及所有设备。
- **物理与生态是有限近似：** 支撑和实景抽查不证明所有动物间的连续动态碰撞均无问题；完整繁殖、全球迁徙、卸载区持续演化与科研级食物网仍未实现。

历史证据继续保留：[75秒冻结样板](docs/SHALLOW_SAMPLE_FROZEN.md) · [原实景验收](https://yydshly.github.io/ocean-world/overview/evidence/review.html) · [入口体验](public/overview/evidence/entry-experience.json) · [跨区准备流水线](docs/TRANSITION_PIPELINE.md) · [历史校验收尾](docs/HISTORY_PIPELINE_CLOSEOUT.md)。历史的失败与“未部署”描述保留当时状态，不替代本次发布结果。

## 本地运行

需要Node.js 22与npm；当前构建基于React、Vite和Three.js。

```bash
npm ci
npm run build:local
npm run preview:local
```

使用终端显示的本地服务地址，进入以下路径：

- 当前浅海体验：`/ocean-world/?demo=shallow-journey&seed=55`
- 产品导览：`/ocean-world/overview/`
- 阶段04对照：`/ocean-world/overview/stage-04/`
- 历史75秒样板：`/ocean-world/?demo=shallow-sample&seed=55`

`build:local`与`preview:local`固定配套`/ocean-world/`基路径。开发可运行`npm run dev`，使用终端实际显示的地址；预览服务不负责自动构建。只有导览静态文件时，也可直接打开`public/overview/index.html`阅读，3D体验仍需运行服务。

```bash
npm run build:overview    # 更新可部署导览HTML和目录，不修改原版引导PNG
npm run test:publication # 检查导览链接、资源、目录数量和构建基路径
npm run test:shallow     # 浅海功能回归，具体范围以脚本与CI记录为准
```

原生贴图检查需要Python 3.10：先运行`python -m pip install -r requirements-test.txt`；可用`SHALLOW_PYTHON`指定Python路径。CI自动安装这些测试依赖，网页运行与普通构建无需Python。现有中文讲解是随站点提供的静态音频；浏览器播放不需要服务凭据。

## 部署与目录

GitHub Pages使用`.github/workflows/pages.yml`：依赖安装 → 按仓库基路径构建 → 功能及发布检查 → 上传静态文件 → 发布。推送`main`会触发；部署要求仓库变量`PAGES_ENABLED=true`及Pages的Actions发布设置。静态产物是`dist/client/`。既有237个世界检查文件保留：236个分为8个并行组，1个依赖构建产物的检查随构建执行；浅海和导览另有独立检查。所有必要组通过后才部署。

| 路径 | 内容 |
| --- | --- |
| `src/ShallowSampleApp.jsx`、`src/shallowSample*`、`src/shallowJourney*` | 浅海样板、4分钟路线、栖息地、群落和讲解 |
| `src/OceanApp.jsx`、`src/ocean*`、`src/world/` | 持续探索、动物、生态与渲染 |
| `src/sceneCatalog.js`、`src/demoCapabilities.js`、`src/directorTour.js` | 生物目录、入口与导演章节 |
| `public/overview/` | 正式产品导览、原版引导图、实景图与精选验收证据 |
| `public/assets/` | 运行素材、署名与来源清单 |
| `tests/` | 功能、几何、生态、加载及发布验证 |
| `docs/` | 当前状态、阶段记录、发布说明与历史归档 |
| `output/` | 本机原始验证与冻结归档；多数不入库，不作为构建必需输入 |

## 素材、署名与使用范围

模型与纹理由项目自制或使用免费且允许按条件再分发的来源。第三方素材包括 **CC0、CC BY、CC BY-NC、CC BY-NC-SA**；保留作者、来源、改动说明与原有条件。**免费不等于无限制商用**，尤其非商业及相同方式共享素材需要按各自许可处理。本仓库未将所有内容统一授权为MIT或其它宽松许可证。

完整[模型来源与署名](https://yydshly.github.io/ocean-world/assets/shallow-artist/credits.html)；各包`public/assets/*/provenance.json`保留具体作者、来源、许可和修改记录。引导图和对照页为项目场景截图，也应保留相应来源和使用条件。

## 阶段管理

本次把已验收的阶段02—04成果、进展说明和实景对照整理为一次发布；不新增场景、动物或资产。发布完成后保持阶段04固定，只有明确的新目标、范围和验收标准才开启后续开发。

早期逐批更新保存在[README历史归档](docs/history/README-before-product-release.md)和[状态历史归档](docs/history/CURRENT_STATUS-before-product-release.md)。最新本地技术基线为`22987c4`，远端具体版本及部署是否完成以[本次发布说明](docs/releases/STAGE_04_PUBLICATION.md)和GitHub Actions为准。
