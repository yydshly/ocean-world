# 浅海底栖生命四类：来源与尺寸合同

核对日期：2026-10-07。独立目录为 `src/oceanBenthicLifeSpecies.js`，四个具名种来自热带印度—西太平洋资料。它们不是某一站位同时出现的野外样方，也不证明完整自然群落。旧目录与第一批来源不改写。

| ID / 学名 | sizeM / 选定范围（米） | 来源尺度及水深口径 |
| --- | --- | --- |
| tiger-cowrie / Cypraea tigris | 壳长 / 0.05–0.09 | Lizard Island壳长实例0.085；Redmap/CMFRI参考上限0.14/0.15。两资料分别给1–10米、10–40米；本版选3–18米，不将合并资料当完整分布。 |
| spotted-hermit-crab / Dardanus megistos | 借用壳长 / 0.06–0.10 | 壳长是未校准展示选择。原始分类标本量的是盾板长0.0096/0.0107米，不能当作壳长或整个蟹长。原始生境为潮间/浅潮下沙泥、草床、礁坪，另有Mayotte夜潜10米记录；选3–18米是实现范围，不是实测上下界。 |
| blue-spotted-ray / Taeniura lymma | 盘宽 / 0.25–0.34 | FRDC报告约0.35米盘宽上限，因此不保留0.38米候选。澳大利亚博物馆另列盘宽0.30、全长0.70米，两最大值不能拼成同一个体。官方水深0–50米，多见≤20米；选3–20米。 |
| reef-goatfish / Parupeneus barberinus | 含尾全长 / 0.20–0.32 | FAO约0.50米上限、通常到0.30米。博物馆水深1–100米；本版只选3–22米沙砾底/礁边/草床边缘。 |

虎斑宝贝的壳形、当地尺寸实例与浅海生境采用[澳大利亚博物馆Lizard Island现场记录](https://lifg.australian.museum/HotShot.html?hierarchyId=PVWrQCLG&resourceId=A3p1oQte)、[IMAS/Redmap](https://www.redmap.org.au/species/2/209/)、[ICAR-CMFRI物种资料](https://eprints.cmfri.org.in/14906/1/Cypraea%20tigris.pdf)。[2019原始夜潜研究](https://www.tandfonline.com/doi/full/10.1080/10236244.2019.1637701)观察到它捕食海绵，不能写成纯藻食动物。

白斑寄居蟹的身份、盾板度量、红色白斑及生境采用[2024印度尼西亚原始分类调查](https://www.scielo.br/j/nau/a/PSZ83yDGf9M7M6577jBrNpQ/?lang=en)、[Mayotte原始调查](https://decapoda.nhm.org/pdfs/38885/38885-002.pdf)。[2023菲律宾原始野外/水槽试验](https://doi.org/10.1017/S0025315423000735)确认可捕食海参幼体，并分别度量盾板长、壳口长/宽；它不是只有“垃圾清理”功能的无害食腐替身。本文不搬用试验摄食率、饥饿处理或密度，也不实现具体海参捕食。

鳐鱼尺度和水深优先用[FRDC官方物种报告](https://www.fish.gov.au/docs/SharkReport/2023_FRDC_Taeniura_lymma_Final.pdf)；体型辨识与食物采用[澳大利亚博物馆](https://australian.museum/learn/animals/fishes/bluespotted-fantail-ray-taeniura-lymma-forsskal-1775/)及[Museums Victoria](https://fishesofaustralia.net.au/home/species/2030)。羊鱼尺度、触须与胃含物采用[FAO原作者资料](https://www.fao.org/4/y0770e/y0770e39.pdf)，活动和水深采用[澳大利亚博物馆](https://australian.museum/learn/animals/fishes/parupeneus-barberinus-lacpde-1801/)、[Museums Victoria](https://fishesofaustralia.net.au/home/species/586)。鳐与羊鱼都吃底栖动物，不能将未分辨代理池改称完整碎屑饮食。

## 同一渲染与支持合同

下列数值乘以实际 `sizeM`。+X朝前，Y朝上，Z为横向；均是保守展示净空，不是实测解剖比例。附底模型最低Y=0；羊鱼须的负Y必须进入离底净空。盘宽归一与含尾长度归一不同。

| 类别 | X包络 | Y包络 | Z包络 | 保守水平半径 |
| --- | --- | --- | --- | --- |
| 虎斑宝贝 | −0.52…+0.70 | 0…0.50 | ±0.33 | 0.8 |
| 寄居蟹 | −0.66…+0.98 | 0…0.80 | ±0.66 | 1.2 |
| 蓝斑条尾魟 | −2.20…+0.60 | 0…0.20 | ±0.55 | 2.3 |
| 羊鱼 | ±0.55 | −0.32…+0.25 | ±0.16 | 0.6 |

宝贝壳长归一为1，但足/触角可伸出；寄居蟹借壳X从−0.65到+0.35，壳长1，露出的足钳另外占位。鳐盘宽Z为1，完整尾端仍在支持与避碰包络中。羊鱼含尾全长X为1，下颌双须另纳入净空。渲染更多斑点、壳纹、鳍与触须不产生新个体或额外生物量。

所有出生数量、密度、移动、摄食及代谢率未校准。实现可扣减原有未分辨的相对有机食物库存，必须同时保持食物/物质账平衡，并注明其代表尚未解析的底栖动物、海绵或可用食物；不能声称可见尸体等于全部自然食物、四种自然共享完全相同饮食，或这已经覆盖其完整食物网。
