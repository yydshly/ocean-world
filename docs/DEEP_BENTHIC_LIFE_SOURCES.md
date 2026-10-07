# 深海软底新增四类：来源与准入边界

核查日期：2026-10-07（Asia/Shanghai）。独立目录为 `src/deepBenthicLifeSpecies.js`，不改动原来的海猪、鼠尾鳕、绒球海葵或海蜘蛛身份。目标是一次有限泥底群落补充，仍是东北太平洋约3500米示意，不是Station M或某次调查的重建。

| 本批ID与界面名称 | 身份与深度参考 | 显示尺寸的度量 | 实现食物代理 |
|---|---|---|---|
| `abyssal-brittle-star` 深渊长臂蛇尾 | `Ophiosphalma glabrum`，命名种；参考878–5203米，含东北太平洋分布 | 全臂跨距10–18厘米；不是盘径；未核定完整跨距上限 | 现有 `surfaceDetritus`，只代表杂食中的碎屑部分 |
| `pyramid-urchin` 深海金字塔海胆 | `Echinocrepis rostrata`，命名种；北太平洋3315–5020米 | 壳体前后长4.5–7.5厘米；短棘、管足另计净空；未核定自然上限 | 现有 `surfaceDetritus`；肠道微生物未建模 |
| `acorn-worm-group` 背帷肠鳃类（属代表） | `Tergivelum spp.`，属代表；参考种T. baldwinae的沉积底记录2712–3954米 | 全体长12–24厘米；参考活体9–28厘米，不作为全属上限 | 现有 `surfaceDetritus`；不增加沉积质量或排泄库存 |
| `deep-amphipod-group` 深海端足类（属代表） | `Eurythenes spp.`，属代表；旧广义复合群550–7800米，北太平洋样本含3193与3982米 | 身体长4–7.5厘米；触角和尾肢另计净空；154毫米是旧复合群参考上限 | 现有 `benthicAnimalFood` 未分辨动物性营养；不是可见尸体或实际捕杀 |

四类统一选择3400–3600米为生成准入窗口，覆盖本场近3500米实际床深。它是作者选择，不是自然物种的完整分布范围。尺寸、密度、速度、摄食/代谢、年龄、温盐氧和底流均未校准。来源范围重叠不证明四类在同一位置共现，也不要求每个生成区都有四类。中文名称采用描述性名称或译名。

## 蛇尾：同地记录与完整轮廓分别有依据

[Seid等2025年原始名录](https://www.sciencedirect.com/org/science/article/pii/S1313298925000011)给出东北太平洋分布和深度汇总；Figure64A/B标注活体背腹面标本E7046。参考保留中央盘、五条细長渐尖关节臂与短棘。该标本来自较浅的Costa Rica，图只是形态参考，不冒充加州3500米现场照片。

[Summers与Nybakken2000年原始调查Table1](https://darwinweb.africamuseum.be/echinodermata_v2/index.php/docman0/documents-public/894-summers-and-nybakken-2000/file)有Monterey和Pioneer峡谷记录，实际调查深度与汇总范围分别处理。[Stratmann等2025年原始食性研究](https://www.vliz.be/imisdocs/publications/419159.pdf)支持机会型杂食及泥面、掩埋行为；不能把本版单一碎屑池称作完整食谱。

## 海胆：采用深渊不规则壳体

[2024年E. rostrata原始线粒体论文](https://pmc.ncbi.nlm.nih.gov/articles/PMC10962292/)给出3315–5020米的北太平洋分布和高金字塔形壳体，Figure1A明确标注SIO-BIC E4015的背侧及侧面。这个轮廓与浅海球形长刺海胆不同。

[2021年原始Station M营养研究](https://www.nature.com/articles/s41598-021-91927-4)在约4000米研究沉积摄食者及肠道营养，说明生理营养比直接把碎屑变成动物体复杂。这里只扣除原来的相对碎屑库存，不声称模拟微生物群或实测碳通量。

## 肠鳃类：补上原先缺失的具体参考，保持属身份

[Osborn等2012年原始论文Table1](https://pmc.ncbi.nlm.nih.gov/articles/PMC3282343/)把T. baldwinae的2712–3954米沉积底记录定位到加州中部至华盛顿海域。它比单独引用4000米照片多了一项实际深度依据，但不等于本场具名种已确认。

[Holland等2009年原始描述](https://doi.org/10.5252/z2009n2a6)区分吻、领、成对侧背帷和完整躯干，并记录活体前后颜色；Figures2/3和[MBARI标注的Station M实例](https://www.mbari.org/news/a-bountiful-harvest-of-deep-sea-acorn-worms/)给出具体参考身份。实现采用这一有限轮廓，界面仍写Tergivelum属代表，不添加其他科的紫色宽唇形态，不把纲/属提升为命名种。自然漂移和粪便轨迹本版未实现。

本次来源证据更新原[深海首版方案](DEEP_SEA_PLAN.md)对肠鳃类的暂缓判断；Peniagone的地方形态暂缓保持。没有声称已完成第三方参考像素的多视角检验或浏览器画面验收。

## 端足类：旧学名不能覆盖现代全部深渊种

[Bucklin等1987年原始调查](https://www.sciencedirect.com/science/article/abs/pii/0198014987900549)提供加州外海至中北太平洋的旧复合群样本。[Havermans等2013年原始遗传/形态论文Table1](https://journals.plos.org/plosone/article?id=10.1371/journal.pone.0074218)列北太平洋不同水深，并表明有多个谱系。[2015年原始分类修订摘要](https://mapress.com/zootaxa/2015/f/z03971p080f.pdf)进一步区分现代E. gryllus与深渊种。因此本场只标Eurythenes属代表，不能把历史全海洋记录统称现代E. gryllus种。

[Stoddart与Lowry2004年原始形态处理的数字转录](https://tb.plazi.org/GgServer/html/2D09EC23E90EFFADFFDDFDE9FF75FAA6)是明确的旧广义E. gryllus参考，含标注Figures1–11。模型仅保留侧扁分节体、两对触角、七对胸肢（其中前两对为颚足）、三对腹肢和尾肢，不确定眼斑或种级诊断。本文未核得加州3500米准确记录；属级地区/深度相容不是局地种群证据。曾检索到AWI表格的“3500”实际属于耗食速率栏，不采用其为深度来源。

## 实现与取证范围

新增动物只在确认为空的持久化新区、原生床面及实际食物斑块附近准入；不是把具名动物当装饰，原动物身份、死亡、时钟、食物和历史不能改写。旧存档不补货。读失败不当新区，原子保存失败不公开新动物。实际边界/清理/总动物预算继续沿用原系统。

完整身体净空按目录里的本地+X前向、+Y向上、Z横向包络计算，跨距、壳长、全体长不能互换。包络是保守实现数据，不是影像测量。静止/摄食和移动动画跟随生态时钟，无独立生物发光、太阳光、巨藻或光合作用。来源可支持形态、分类和功能角色，不能支持实测动率、完整自然食物网、当前GPU效果或纪录片写实验收。

本轮实际读取范围：原始论文/机构网页正文与索引文本、食性PDF全文、原始形态数字转录和标注图说明；部分PMC全文及Smithsonian PDF请求被拒绝或超时，不能写成全部原图已检验。第三方图片不复制到项目资产；链接用于依据，程序模型仍是原创简化代表。
