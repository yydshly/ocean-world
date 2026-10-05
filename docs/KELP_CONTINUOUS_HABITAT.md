# 持续海带林的生境与动物边界

2026-10-04 核验。参考 Monterey / 加州沿岸巨藻林；不是当地样方重建。已审阅 `biomes.js`、`kelpHabitat.js`、`kelpSimulation.js` 与既有形态说明，并重新核对下列 Monterey Bay Aquarium 物种页。现有巨藻及五类动物足以先完成外围海域的真实位置、活动与摄食，不要求每个分区出现全部物种。

| 生物 | 外围分配与最低活动要求 | 资料支持与模型边界 |
| --- | --- | --- |
| [巨藻 Macrocystis pyrifera](https://www.montereybayaquarium.org/animals-the-ocean/animals-a-to-z/giant-kelp) | 合适浅水硬底上的疏密林斑；固定根部，藻柄与叶片共享实际位置和时钟 | 固着器锚定岩底，叶基气囊帮助藻体接近水面；砂质空地不直接长出悬浮巨藻。长度须依据实际水深选择。 |
| [紫海胆 Strongylocentrotus purpuratus](https://www.montereybayaquarium.org/animals-the-ocean/animals-a-to-z/purple-sea-urchin) | 林底岩面、岩隙与林缘硬底；贴面慢爬，接近可达藻料后摄食 | 自然界也能沿砂等表面移动；本轮限定连通岩面属于保守支持面简化，不能说它只生活在岩石上。 |
| [胶靴石鳖 Cryptochiton stelleri](https://www.montereybayaquarium.org/animals-the-ocean/animals-a-to-z/gumboot-chiton) | 有附着藻的岩底；腹足贴岩，沿同一可达支持面刮食 | 以红藻为主，也吃其他藻；夜间较活跃有自然史依据，但速度和活动比例未校准。 |
| [蝙蝠海星 Patiria miniata](https://www.montereybayaquarium.org/animals-the-ocean/animals-a-to-z/bat-star) | 林底、林缘及相邻砂砾空隙；贴底寻食，不跳越岩面断边 | 是利用活或死亡动植物材料的杂食者；`detritus` 只代表可食有机材料，不能将它定为纯沉积摄食者。 |
| [褐色钟螺 Tegula brunnea](https://www.montereybayaquarium.org/animals-the-ocean/animals-a-to-z/brown-turban-snail) | 有宿主的巨藻冠层可达叶面；沿叶慢爬并随叶片被动移动 | 官方物种页明确主要见于冠层顶部并刮食叶面硅藻膜；无巨藻宿主的空地不分配附叶个体。 |
| [巨型海藻鱼 Heterostichus rostratus](https://www.montereybayaquarium.org/animals-the-ocean/animals-a-to-z/giant-kelpfish) | 林体与有藻遮蔽的边缘；分散悬停、短距接近局部小型动物食物 | 叶状身体用于藻间伪装，食物包括小型甲壳类、鱼和软体动物；不把这种代表鱼复制成开阔水层的大群游鱼。 |

上述分配是根据生境资料作出的实现选择。外围林体、岩底和空地可以连贯过渡，但每个新地区须先读取实际支持面、林体宿主及可达食物。数量、林体覆盖阈值、移动速率和食物池均为未校准的展示参数；不得把现有固定样本数量按面积直接外推为真实密度。摄食动作须伴随局部资源扣减，叶片被动位移须与主动爬行区分。

现有巨藻的同根多柄结构和向水面逐渐密集的叶位可由 [Reed 等 2009 年加州原始研究](https://link.springer.com/article/10.1007/s00227-009-1238-6) 支持。当前四柄、每柄 54 个叶位仍是渲染抽样。[Leal 等 2021 年原始研究](https://sembrandoelmar.cl/web/wp-content/uploads/2021/09/PAPER-FENOLOGIA-REPRODUCTIVA-MACROCYSTIS-PABLO-2021.pdf) 的叶片、气囊尺寸来自南新西兰，支持现有尺寸范围的形态参考，不能作为 Monterey 的现场校准；保留 `measuredAtSite=false`。

开阔水层目前只有藻间鱼，存在表现上的缺口。若后续确需增加一个代表，可选 **blue rockfish，Sebastes mystinus**（中文采用描述性译名，以学名辨认）。[CDFW 生活史表](https://wildlife.ca.gov/Conservation/Marine/Life-History-Fish) 确认其岩礁和海带林生境；[CDFW 近岸鱼类资料 D.9.8](https://nrm.dfg.ca.gov/FileHandler.ashx?DocumentID=33863) 描述林冠附近的水层活动与群集。可复用现有普通鱼体构建流程作近似代表，不能直接将叶状海藻鱼换名。本轮先保留为候选，不新增群体机制，也不采用旧资料的种群密度、年代分布或捕获量作当前校准。

本轮主来源：

- [NOAA Monterey Bay National Marine Sanctuary：Iconic Kelp Forests](https://montereybay.noaa.gov/science/characterization/kelp-forests.html)：温带浅水岩底及林体生境。
- [Monterey Bay Aquarium：Giant kelp](https://www.montereybayaquarium.org/animals-the-ocean/animals-a-to-z/giant-kelp)：本地巨藻结构、固着与垂直生活空间；五类动物见上表各物种页。
- [CDFW：Life History Information for Selected California Marine Fishes](https://wildlife.ca.gov/Conservation/Marine/Life-History-Fish)：新增候选鱼的生境交叉核验。

本次不扩展繁殖、死亡补充、季节迁移、风暴断裂、海胆荒漠或完整食物网；持续加载与保存不能被描述为已经实现这些长期机制。
