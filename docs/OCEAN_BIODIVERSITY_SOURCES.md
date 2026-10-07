# 浅礁首批八类：来源与实现口径

核对日期：2026-10-07。目录位于 `src/oceanBiodiversitySpecies.js`，与旧定点浅礁、海带林和深海目录分开。范围是热带西太平洋代表群落，不是大堡礁某站位、季节或野外样方的重建。首次接入是否有活体、实际存活数、景观株数和名录数必须分别统计。

## 分类与配对

- 团块珊瑚使用 **Porites lobata s.l.**。资料明确提示复合种，因此保留 `species-complex` 标识，不把一个半球程序形态称为精确单种鉴定。[Corals of the World](https://www.coralsoftheworld.org/species_factsheets/species_factsheet_summary/porites-lobata/)
- 太平洋鹦嘴鱼使用 **Chlorurus spilurus**。澳大利亚本土/GBR资料将其与印度洋/红海 **C. sordidus** 区分。表面刮食功能不能等同纯宏藻营养，更不能推出其已核实专食本包葡萄蕨藻。[Museums Victoria](https://fishesofaustralia.net.au/home/species/5300)、[2026原始营养研究](https://link.springer.com/article/10.1007/s00338-026-02925-9)
- 壮丽海葵使用现接受名 **Radianthus magnifica**，保留旧组合 **Heteractis magnifica**。**Amphiprion percula** 在GBR外礁使用此宿主有博物馆资料与Lizard Island现场记录。实现要求实际存在的同区域宿主，不能在无宿主的沙地凭空生成共生鱼。[WoRMS](https://www.marinespecies.org/aphia.php?id=290090&p=taxdetails)、[2024原始实地指南](https://zenodo.org/records/13760333)、[澳大利亚博物馆](https://australian.museum/learn/animals/fishes/eastern-clown-anemonefish-amphiprion-percula/)
- **Sabellastarte spectabilis** 的菲律宾模式材料及西太平洋类群有原始分类研究；冠色不能独立证明种鉴定。CSIRO目录记录也不证明某个GBR样方共现。资料冠幅与水深取自韩国国立馆，该来源地点范围不可改写为GBR测量。[原始分类研究](https://www.gfbs-home.de/fileadmin/user_upload/ode2mods/ode/ode10/ode10_0351/article.pdf)、[国立馆物种资料](https://www.mbris.kr/pub/marine/tsearch/tsearchDetail.do?spcTxnId=270000015800)

## 尺寸

所有 `displaySizeM.range` 都是有限展示选择，不是野外尺寸分布。`referenceSizeM` 另保留来源实例/范围/上限，度量不可互换。

| ID | sizeM口径 | 展示选择（米） | 尺度依据与限制 |
| --- | --- | --- | --- |
| biodiversity-massive-coral | 群体直径 | 0.55–1.10 | 来源群体可超过4米；不是单个珊瑚虫或本场最大值 |
| biodiversity-grape-algae | 所选斑块直径 | 0.18–0.36 | 芽高0.02–0.05米另列；不能将斑块宽画成藻芽高度 |
| tropical-urchin | 含刺整体跨距 | 0.24–0.38 | 来源壳径上限0.08米、单刺上限0.30米；整体跨距为实现选择 |
| feather-duster | 展开羽冠直径 | 0.05–0.06 | 管内身体实例长0.165米另列 |
| sand-goby | 鱼全长 | 0.10–0.16 | 来源上限0.18米 |
| reef-parrotfish | 鱼全长 | 0.20–0.32 | 来源上限0.37米；选终期外观 |
| shallow-anemone | 口盘直径 | 0.25–0.60 | 来源上限1米；触手长度另列 |
| clown-anemonefish | 鱼全长 | 0.05–0.075 | 博物馆条目上限0.08米，Lizard Island条目0.11米；显示选择兼容两者 |

葡萄蕨藻的匍匐形态和芽尺度参照[Smithsonian实地指南](https://striresearch.si.edu/taxonomy-training/wp-content/uploads/sites/31/2020/03/PASI_platessmall_2009.pdf)，本地发生证据参照[Lizard Island约15米现场记录](https://lifg.australian.museum/HotShot.html?resourceId=UJqXwxh2)。海胆外形、夜行庇护和尺度参照[Lizard Island物种条目](https://lifg.australian.museum/Group.html?groupId=Fg2ZK5TA&hierarchyId=PVWrQCLG)。砂虾虎的砂中无脊椎动物摄食、全长和水深参照[Museums Victoria](https://fishesofaustralia.net.au/home/species/179)。

## 水深与生态边界

`referenceDepthM` 只有资料明确的物种范围或实例；`null` 表示本次资料没有提供可直接使用的完整范围。`admissionDepthM` 是本包在已有浅海生成器内的保守选择，不能作为物种完整分布。羽冠管虫限制5–18米；海葵与小丑鱼限制3–12米并检查宿主；其余3–18米仍须满足真实底质、光照与几何支持。

数量、速度、摄食、代谢、生产、竞争和死亡参数没有野外校准，校准字段保持 `null`。小型底栖猎物、表面微生物基质和悬浮食物用明确标识的资源代理。珊瑚/海葵共生光合、海胆侵蚀、鹦嘴鱼珊瑚摄食、砂虾虎挖穴和小丑鱼繁殖不能仅凭目录档案宣称已经实现。当前来源也不支持整片海域已完成真实生态或浏览器视觉验收。
