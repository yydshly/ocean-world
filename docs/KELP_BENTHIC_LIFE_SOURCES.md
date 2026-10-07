# 温带巨藻林底栖动物来源包

2026-10-07 查阅。四种是蒙特雷及东北太平洋温带林底的有限代表组合，不是同一地点、同一时间的野外调查重建。身份和自然食谱与实现参数分别记录在 `src/kelpBenthicLifeSpecies.js`；此独立目录不改动旧巨藻物种、历史种群或先前浅礁目录。

## 身份、真实尺度和本次选择

| 实体 | 资料尺度 | 本次展示尺度、水深与底质 | 需要辨认的完整形态 |
| --- | --- | --- | --- |
| 红鲍 *Haliotis rufescens* | 水族馆报告壳长约20厘米，参考上限30厘米；不是足或触须总长 | 壳长12–18厘米，3–20米，稳定原生岩面 | 低耳形砖红壳、3或4个开放壳孔、宽暗足和外缘触须 |
| 北方藻蟹 *Pugettia producta* | 大学资料雄甲宽至9.3厘米、雌至7.8厘米；不能当作腿展开宽 | 甲宽4.5–7.5厘米，3–20米，林底岩面 | 平滑角盾甲、双叉额角、侧齿、8条步足和2只螯 |
| 加州褐海兔 *Aplysia californica* | 身体最长40厘米，多数约20厘米；与黑海兔分开 | 身体长10–18厘米，3–15米，受庇护、有藻的岩底 | 无外壳的斑驳软体、成对折起侧足叶、两对头部触角 |
| 巨羽状海葵 *Metridium farcimen* | 完整展开高参考至50厘米、特别大个体可至1米；冠径参考至25厘米 | **柱高**18–32厘米，3–25米，稳定岩面；冠另含于最高1.4倍柱高的展示包络 | 足盘、平滑高柱、深分叶口盘和密集细触手冠；是动物 |

红鲍的岩底、浅潮下和大型藻类饮食来自[太平洋水族馆物种页](https://www.aquariumofpacific.org/onlinelearningcenter/species/red_abalone)；[蒙特雷湾SIMoN物种页](https://sanctuarysimon.org/dbtools/species-database/species-info-ajax.php?sID=120)补充参考分布和岩面取食漂落藻叶。选用浅海范围是实现选择，不能把资料的180米分布上限当作本场深海群落许可。

蟹的甲宽、长足及林底/藻体生境依据[俄勒冈海岸水族馆](https://aquarium.org/animals/kelp-crab/)与[Walla Walla大学的现场自然史资料](https://inverts.wallawalla.edu/Arthropoda/Crustacea/Malacostraca/Eumalacostraca/Eucarida/Decapoda/Brachyura/Family_Majidae/Pugettia_producta.html)。[Dobkowski（2017）原始摄食实验](https://pubmed.ncbi.nlm.nih.gov/28560113/)确认牛海带和小螺皆可成为食物；本次仅模拟岩底活动，不模拟攀爬活藻叶。[论文全文](https://peerj.com/articles/3372.pdf)讨论了昼夜节律证据不充分，因此不能称其必然夜活。

海兔的身份、侧足/触角、尺寸和生长阶段饮食来自[太平洋水族馆](https://www.aquariumofpacific.org/onlinelearningcenter/species/california_brown_sea_hare/)。该资料说明成体偏浅的中/低潮带，幼体可至18.3米；本次较小个体选取幼体兼容的水深，**年龄未测量，尺寸也不能反推出年龄**。[蒙特雷水族馆巨藻林展示](https://www.montereybayaquarium.org/visit/exhibits/kelp-forest)列有海兔类群，但这项展示清单不独立证明物种身份或野外密度。

海葵的高柱、分叶冠、岩面附着、15米现场个体与参考完整高依据[Walla Walla大学](https://inverts.wallawalla.edu/Cnidaria/Class-Anthozoa/Subclass_Zoantharia/Order_Actiniaria/Metridium_farcimen.html)，巨藻林岩底语境由[SIMoN](https://sanctuarysimon.org/dbtools/species-database/species-info-ajax.php?sID=108)支持。SIMoN水深表的0–0是空值占位，不采为范围；1989年前混称 *M. senile* 的资料也不用于本种速率。[Wells等（2022）的原始DNA食谱研究](https://onlinelibrary.wiley.com/doi/10.1002/edn3.225)确认其为摄食多样动物的悬浮摄食者，不能称为光合植物。

## 实现边界

前三种只扣减物理附近、已持久保存的原有岩底食物斑块 `algae` 库存，表示**未分辨的藻类营养代理**。不扣减展示巨藻的叶片几何或声称完整食谱；蟹的动物性饮食暂缺。海葵扣减附近同一类斑块的 `detritus`，仅表示**未分辨的近底动物性营养代理**；这是保留现有库存架构的局限，不能声称已生成浮游动物、真实滤水过程或捕食可见猎物。

所有实际摄食仍受原库存有限量和保存结果约束。数量、速度、摄食/代谢、年龄、种群密度、温度、盐度、含氧量、流速和昼夜阈值均未用当地数据校准，目录相应校准字段为 `null`。几何包络含壳外足/触须、蟹的全部腿钳、海兔侧足和海葵展开冠，是完整展示净空上界，不是来源中的测量解剖比例。海葵本版固定附着位置；未实现繁殖、离线演化、真实食物网或生态预测。

此包的资料核验与CPU/Three检查不能替代浏览器、GPU或整体画面的实际验收。
