# 独立生境研究包

核对日期：2026-10-04。研究资料入口为`src/biomes.js`，导出`biomeCatalog`、`biomeById`、`biomeSources`和`biomeModelNotes`；实际菜单与准入目录由`src/sceneCatalog.js`和各生境独立模型提供。三个生境均已接入原型。热带浅礁有13个具名物种和1个藻膜功能群；海带林的6个具名条目全部接入，标为`integrated-prototype`；深海研究包有6个候选，原近距离模型保持海猪属、鼠尾鳕科与具名绒球海葵3项／16代表体，持续探索另接入海蜘蛛属代表，菜单共4项。原生目录与新增区域目录分开，状态仍为`integrated-prototype-subset`。研究候选数不能当作实际菜单的完成状态。

目标是纪录片式安静观察：形态、真实比例、所在微生境和行为原因应可辨认。海带林与深海不可只给现有热带礁换颜色。表中“展示尺寸”是开发选择，“资料尺度”是来源明确给出的上限或实例；两者均不能冒充野外尺寸分布。`null` 代表尚无校准数据，不代表零。

## 场景边界

| 独立生境 | 研究水深范围；当前场景选择 | 自然光与食物输入 | 底质及可观察现象 |
| --- | --- | --- | --- |
| 热带浅礁 | 5–15m；当前参考水面8m，开发选择 | 水面太阳光；藻类及共生供能、浮游摄食和底栖食物 | 钙质沙斑、礁石、枝状珊瑚庇护；清洁站、刮藻、伏击、贴底摄食 |
| 温带海带林 | 8–20m；当前参考水面12m，开发选择 | 水面太阳光，经巨藻冠层遮蔽；资源模块将光合与营养作用作简化代理，没有完整溶解营养盐循环 | 岩底固着器、柔性藻柄、近水面冠层与林底；摆动、伪装、冠层小螺、海胆刮食 |
| 深海软底 | 3000–4000m；当前观察参考3500m，开发选择 | 无太阳光；外部沉降有机物与动物性食物代理。观察器灯光仅用于看见局部海床，不增加生态能量 | 低起伏软底与有限食物斑块；当前准入代表体贴底摄食、近底寻食和触手捕获 |

浅礁环境参考 [NOAA 浅海珊瑚礁生境](https://www.fisheries.noaa.gov/national/habitat-conservation/shallow-coral-reef-habitat)，物种细节见 `SCIENCE.md` 和 `SOURCE_AUDIT.md`。珊瑚是动物，可捕捉食物，不能以纯植物模型代替。[NOAA 珊瑚虫资料](https://oceanservice.noaa.gov/education/tutorial_corals/coral01_intro.html)

海带林参考 Monterey / 加州巨藻林。NOAA 描述浅水岩底、主要浅于约 30 m 的群落，并说明冠层结构及海胆对覆盖的影响；本包水深没有按特定样方校准。[NOAA Iconic Kelp Forests](https://montereybay.noaa.gov/science/characterization/kelp-forests.html)、[NOAA What is a kelp forest?](https://oceanservice.noaa.gov/facts/kelp.html)

深海选取东北太平洋软底作为地理参考，不宣称重建单个站位。Monterey 深水观测与 Station M 约 4000 m 记录支持这一研究方向。六个候选的来源汇总深度都覆盖选取区间，但类群深度重叠不证明所有动物在同一次野外调查中共现。[MBARI 深海肠鳃类观测](https://www.mbari.org/news/a-bountiful-harvest-of-deep-sea-acorn-worms/)

NOAA 将超过约 1000 m 的区域描述为无太阳光；3000–4000 m 场景应关闭阳光、阳光焦散和局部光合。可以提供明确标识的观察器灯锥，其照明不增加生态能量。[NOAA 海洋光照](https://oceanservice.noaa.gov/facts/light_travel.html) 上层生产形成的有机颗粒可以向深海沉降，但本包没有给出已校准的沉降通量。[MBARI 海雪生态](https://www.mbari.org/project/ecology-of-marine-snow/)

## 海带林：6 个已接入的具名条目

所有条目均保留学名。部分中文名为便于阅读的描述性译名，以学名作为鉴定入口。资料尺寸来自当前水族馆物种页，不将旧卡片可能不同的上限混入。

| 条目与来源 | 资料尺度；选取展示尺度 | 可实现的代表形态 | 简化行为与位置 |
| --- | --- | --- | --- |
| 巨藻 *Macrocystis pyrifera*，[Giant kelp](https://www.montereybayaquarium.org/animals-the-ocean/animals-a-to-z/giant-kelp) | 藻体长度约至 30 m，理想条件至 53 m；展示藻体长 8–18 m | 岩底固着器、柔性藻柄、叶基气囊、金褐色叶片 | 固着、随流弯曲、叶片延迟摆动；光合与冠层遮蔽。达到水面须按实际水深选长度，不强行拉伸每株 |
| 紫海胆 *Strongylocentrotus purpuratus*，[Purple sea urchin](https://www.montereybayaquarium.org/animals-the-ocean/animals-a-to-z/purple-sea-urchin) | 约至 7 cm across；展示直径 4–7 cm | 球状壳、紫棘、管足 | 岩面与隐蔽孔穴缓慢爬行、摄食红褐绿藻；不瞬间形成海胆荒漠 |
| 蝙蝠海星 *Patiria miniata*，[Bat star](https://www.montereybayaquarium.org/animals-the-ocean/animals-a-to-z/bat-star) | 跨距约至 20 cm；展示 10–18 cm | 短三角臂、臂间蹼、斑驳自然色 | 林底慢爬、摄食活或死亡的动植物材料；可局部表现胃外翻 |
| 巨型海藻鱼 *Heterostichus rostratus*，[Giant kelpfish](https://www.montereybayaquarium.org/animals-the-ocean/animals-a-to-z/giant-kelpfish) | 体长约至 61 cm；展示 20–40 cm | 叶片似的长侧扁体、连续背鳍、绿褐或红色伪装 | 藻叶间悬停、短距移位，取食小甲壳类、鱼和软体动物；不默认群游 |
| 褐色钟螺 *Tegula brunnea*，[Brown turban snail](https://www.montereybayaquarium.org/animals-the-ocean/animals-a-to-z/brown-turban-snail) | 壳尺度约至 25 mm；展示 15–25 mm | 小圆锥褐壳、腹足、附生膜 | 优先冠层叶面慢爬；附着点跟随叶片，食物代理涵盖附着藻等，不能说完整自然食谱 |
| 胶靴石鳖 *Cryptochiton stelleri*，[Gumboot chiton](https://www.montereybayaquarium.org/animals-the-ocean/animals-a-to-z/gumboot-chiton) | 体长约至 33 cm；展示 15–28 cm | 低宽椭圆、砖红外套覆盖八片壳板、宽足 | 林底岩面附着慢爬，主要刮食红藻；不能画成八片壳板全露出的普通小石鳖 |

海带林物种来源为 Monterey Bay Aquarium 的官方自然史资料；环境边界以 NOAA 为主。该组合适合作为区域性候选群落，人口密度、个体比例、摄食速率和季节变化尚未调查校准。

## 深海软底：6 个研究条目，其中3项已准入

仅 *Liponema brevicorne* 在本包定名到物种。其余来源条目为属、科或纲，渲染的代表体必须保留类群标签，不能据通用形态自动命名成某个物种。来源的广泛水深和最大尺寸也不能应用于类群内每个物种。

| 条目与来源 | 来源水深；资料尺度；展示尺度 | 可实现的代表形态 | 简化行为与食物 |
| --- | --- | --- | --- |
| 海猪属类群 *Scotoplanes* spp.，[Sea pig](https://www.mbari.org/animal/sea-pig/) | 1000–6000 m；体长约至 17 cm；展示 8–16 cm | 半透明淡粉软体、支柱状长管足、口部触手 | 泥面慢移，取食新鲜碎屑，食物斑块可产生局部聚集 |
| 冠状海参属类群 *Peniagone* spp.，[Crowned sea cucumber](https://www.mbari.org/animal/crowned-sea-cucumber/) | 220–8600 m；体长约至 30 cm；展示 12–25 cm | 软体、管足与口触手的功能形态代理；具体背部突起须补核对影像 | 以沉积摄食为主，允许少数食物不足后的离底转移 |
| 鼠尾鳕科 Macrouridae，[Rattail fish](https://www.mbari.org/animal/rattail-fish/) | 200–4000 m；体长约至 1 m；展示 35–75 cm | 大头眼、渐尖长尾，代表体可有颏须 | 近底巡游，依局部线索觅食鱼、无脊椎动物与腐肉 |
| 深海肠鳃类 Enteropneusta，[Acorn worm](https://www.mbari.org/animal/acorn-worm/) | 纲条目岸边至 8100 m；纲上限 2.5 m；[Station M 泥面观测](https://www.mbari.org/news/a-bountiful-harvest-of-deep-sea-acorn-worms/)有约 15 cm 示例；展示 15–25 cm | 吻、领和细长软体贴泥；色彩与具体比例等待所选泥底影像 | 沉积摄食与痕迹；漂移有观测，食物不足触发机制仍是研究者假说。藻源颗粒为沉降食物 |
| 巨型海蜘蛛属类群 *Colossendeis* spp.，[Giant sea spider](https://www.mbari.org/animal/giant-sea-spider/) | 2200–4000 m；整体跨距约至 51 cm；展示跨距 20–40 cm | 小躯干、八条细长关节足、长吻管 | 缓慢步行，捕食无脊椎动物；吻管接触海葵的行为有[直接观测](https://www.mbari.org/news/sea-spiders-and-pom-pom-anemones/) |
| 绒球海葵 *Liponema brevicorne*，[Pom-pom anemone](https://www.mbari.org/animal/pom-pom-anemone/) | 100–4100 m；展开跨距约至 30 cm；展示 12–28 cm | 淡粉白紫触手球，可膨胀或收缩，底部接泥 | 多数时间附底、捕获甲壳类和浮游动物；在特定扰动中可滚动后再附底 |

冠状海参网页在本次工具中直接打开失败，其学名、水深和尺寸由该官网的索引内容核对，已在数据标记 `access: 'indexed'`；接入该条目前应补读页面与实际影像。其形态只作属级代表，不承诺具体物种。

资料中的鲸落观测用于解释部分行为，不意味着普通泥底必须摆放鲸尸。热液、冷泉、鲸落和深海珊瑚群落都应有单独生态与来源审查。另查到 [MBARI 粉红海胆](https://www.mbari.org/animal/fragile-pink-sea-urchin/)的资料深度为 100–1000 m，因此不加入本包 3000–4000 m 场景。没有核对到上述六条的发光证据，`verifiedBioluminescence: null` 仅表示未查证，不能读成生物学上永不发光。

## 当前接入状态

海带林已有共享附着曲线、12个代表藻体/48柄/2592叶的形态抽样，以及46个生态单位；柄数/叶数没有倍增资源。叶片尺寸依据与跨区域限制见[KELP_MODEL.md](KELP_MODEL.md)，三种子实验及原始伪影修复见[KELP_VALIDATION.md](KELP_VALIDATION.md)。

深海原近距离模型准入海猪属、鼠尾鳕科代理与具名*Liponema brevicorne*；初始代表体分别8、3、5个，共16个，保持原默认行为。2026-10-04持续探索追加稀疏海蜘蛛属代表，具备实际吻管接触／体况转移与保存链路，详见[DEEP_PREDATOR_INTERACTION.md](DEEP_PREDATOR_INTERACTION.md)。数量和速率是开发示意，未按真实站位丰度校准；没有确认这些代表在同一次3500米调查共现。冠状海参属、肠鳃类仍暂缓，见[DEEP_SEA_PLAN.md](DEEP_SEA_PLAN.md)。表中的离底转移、滚动、痕迹等自然史不能据此认定都已实现。

当前深海没有自然光、太阳焦散、水面网格或局部光合；观察器灯为相机附近的人工灯锥，可开关。180个慢沉降显示海雪点与实际食物库存分离，时钟不生成太阳昼夜周期；温度、盐度与溶氧保留未校准的`null`。软底采用灰褐纹理与低起伏显示，不代表真实沉积物测量。

最新[世界集成检查](../output/validation/world-integration-smoke.json)验证了三生境地形延伸、射线候选机位、暂停、深海灯关闭和资源释放；它使用真实Three.js几何及明确的渲染器／浏览器替身。海带海胆与深海三项的选中中心在Node检查中可见，但实际浏览器全景／近景、光照、遮挡和真实画面导出仍待复核。接入原型不代表风格、操作或耐久里程碑已完成。

## 后续接入验收

1. 每次启用一个独立生境，加载自己的底质、光照、目录和行为。地理参考与水深说明必须可读；类群条目始终标出鉴定层级。
2. 全部形态以米为单位；区分体长、整体跨距和藻体长度。小螺使用微距镜头观察，不为了可见而放大成几十厘米。海面到海床的水深与相机高度分别计算。
3. 林底、冠层、岩孔、泥面和近底水层分别承载相应生物；行为必须由食物、流动、遮挡或风险等原因触发。禁止所有动物同时匀速绕圈。
4. 深海太阳光和局部光合输入必须关闭；人工灯锥有清晰边界。沉降颗粒为输入代理，频率与通量尚未校准。沉积物扰动需要明确触发，不常驻全场泥云。
5. 水温、盐度、溶氧、流速、消光系数、有机输入通量、种群密度、移动与生态速率均保留未校准状态。视觉参数可以设置，但需在模型说明中标识为展示参数。
6. 巨藻成长、长期海胆摄食影响和深海群落变化不能以秒级装饰循环替代。若提供加速，应明确显示模拟时间与倍率，并保存固定种子验证记录。

这是逐一实现的研究包，不是物理或生态预测模型。来源支持自然史、形态和生境约束；实际共现、参数与长期动力学需要后续观测或论文数据。

