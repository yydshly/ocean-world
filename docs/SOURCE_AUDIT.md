# 物种来源审查

核验日期：2026-10-03（Asia/Shanghai）。审查范围：`src/species.js` 的 14 个条目及 `docs/SCIENCE.md` 的自然史/环境资料。审查时只读以上文件，未修改模拟代码或目录数据。

## 结论

四个现用 Fishes of Australia 数字编号 **全部正确**。没有发现将鱼类链接指向另一物种的错误。13 个具名物种和 1 个藻膜功能群的身份/生境选择基本符合印度—西太平洋浅礁范围。

需要补齐的是证据覆盖：绿光鳃雀鲷的现有页面未直接给出食性；清洁虾的 Smithsonian PDF 只是引言提及本种；黑海参现有来源主要证明身份和浅礁生境；砗磲引用的 Smithsonian 群落页没有证明本种滤食和共生藻供能。蓝海星和珊瑚蟹的资源摄食代理必须继续作为模型假设标注，不能说成完整自然食谱。

来源支持自然史及方向，不支持个体共现密度、分钟尺度生理变化、捕食概率、速度、代谢率或资源转换常数。

## 审查方法与访问限制

逐项比较实际页面标题、学名、正文中的生境/食性信息；不根据 URL 编号或链接标签推断内容。优先使用博物馆、NOAA、AIMS、FAO、WoRMS 和原研究。

Lizard Island Field Guide 的直接打开在本工具返回 Internal Error，但搜索引擎返回了对应精确 URL 的完整索引正文，因此身份/宿主判断是“索引内容已确认”，不是当前实时页面可访问的保证。部分 PMC、PubMed、JCU 页面直接打开触发验证码或工具错误；报告区分直接读取和索引/作者机构记录核对，未将访问失败说成错链。

## 14 个目录条目

| 条目/学名 | 实際来源标题及链接 | 身份和生境 | 食性/行为证据与结论 |
| --- | --- | --- | --- |
| 蓝倒吊 — *Paracanthurus hepatus* | [Blue Tang, Paracanthurus hepatus (Linnaeus, 1766) — Australian Museum](https://australian.museum/learn/animals/fishes/blue-tang-paracanthurus-hepatus/) | 页面学名一致，分布为 Indo-West Pacific，图注记录珊瑚海 10 米幼鱼群。 | Feeding and diet 明确浮游动物。浮游摄食配置正确。遇敌向礁体的具体感知/路径属于模拟规则。直接读取确认。 |
| 条纹蝴蝶鱼 — *Chaetodon lineolatus* | [Lined Butterflyfish, Chaetodon lineolatus Cuvier 1831 — Fishes of Australia, 2384](https://fishesofaustralia.net.au/home/species/2384) | 数字 ID 正确；珊瑚丰富的泻湖及向海礁区，常见成对。 | 珊瑚虫、海葵、小无脊椎动物，亦摄少量藻；当前主食概括相符。来源不意味着其只依赖活珊瑚。夜间休息细节未在此页直接核验。直接读取确认。 |
| 绿光鳃雀鲷 — *Chromis viridis* | [Chromis viridis / Blue-green Puller — Lizard Island Field Guide](https://lifg.australian.museum/Group.html?groupId=bWdTTXD5&hierarchyId=CEJQQmVx) | 精确 URL 索引学名相符，蓝绿色小鱼在珊瑚上方群游。 | 原页索引未给出食性。补充 [Blue-green Puller, Chromis viridis — Fishes of Australia, 329](https://fishesofaustralia.net.au/home/species/329)；直接读取 Feeding 明确水层浮游动物，并写枝状 Acropora 上方形成觅食群。 |
| 条纹倒吊 — *Acanthurus lineatus* | [Bluelined Surgeonfish, Acanthurus lineatus (Linnaeus 1758) — Fishes of Australia, 2186](https://fishesofaustralia.net.au/home/species/2186) | 数字 ID 正确；热带印度—西/中太平洋，礁区，页面深度 0–15 米。 | Feeding 明确草食、刮食藻坪，并描述成体守卫藻坪领地。当前藻食功能正确，领地竞争已标为简化。直接读取确认。 |
| 裂唇鱼 — *Labroides dimidiatus* | [Common Cleanerfish, Labroides dimidiatus (Valenciennes 1839) — Fishes of Australia, 250](https://fishesofaustralia.net.au/home/species/250) | 数字 ID 正确；红海/印度太平洋热带和亚热带礁区。 | 明确甲壳类外寄生物和客户鱼黏液、招引客户及清洁站。当前配置相符。寄生指数和清洁收益为模型参数。直接读取确认。 |
| 蜂巢石斑鱼 — *Epinephelus merra* | [Birdwire Rockcod, Epinephelus merra Bloch 1793 — Fishes of Australia, 3848](https://fishesofaustralia.net.au/home/species/3848) | 数字 ID 正确。Birdwire Rockcod 是该学名的澳大利亚俗名，页面也列 Honeycomb Grouper；浅泻湖和半庇护向海礁，定居。 | Feeding 明确伏击捕食者；幼鱼摄甲壳类和小鱼，长大后鱼类比例增加。当前伏击/短追、食性相符。直接读取确认。 |
| 清洁虾 — *Lysmata amboinensis* | [A Western Atlantic Peppermint Shrimp Complex… — Rhyne & Lin 2006, Smithsonian 存储 PDF](https://repository.si.edu/server/api/core/bitstreams/bad160e1-0f77-40ad-b4aa-da30e32a6c35/content)（标题后续部分为 L. wurdemanni 重描述、新种及 L. rathbunae 评论） | 论文主体是西大西洋 peppermint shrimp，并非本种专论；引言 p.165–166 明确将本种举为低密度、成对、长白触须的主动清洁虾。 | 现链接不是完全无关，但不足以独立证明全部本种分布/摄食/客户行为。建议加入下方 Caves et al. 2019 的本种野外清洁研究。此 PDF 直接读取确认。 |
| 黑指珊瑚蟹 — *Cymo melanodactylus* | [Cymo melanodactylus / Black-fingered Coral Clinger — Lizard Island Field Guide](https://lifg.australian.museum/Group.html?groupId=EwuDmKJ0) | 精确 URL 索引身份相符，图注明确 acroporid coral，引用 Patton 与 Pollock 研究。 | 页面没有完整食谱。不能把“局部碎屑资源代理”当作已证实的自然摄食。Pollock 本种研究涉及珊瑚组织摄食与病灶关联；需要维持假设标注，并清楚告知模型未建立珊瑚组织食物池。 |
| 黑海参 — *Holothuria atra* | [Holothuria (Halodeima) atra — Lizard Island Field Guide](https://lifg.australian.museum/Group.html?groupId=7UQOQa5x)；[SWIOP/WP/22 — Fish Handling / Beche-De-Mer Processing — FAO](https://www.fao.org/fishery/docs/CDrom/aquaculture/a0845t/volume2/docrep/field/279545.htm) | LIFG 精确索引身份一致、浅礁坪常见；FAO 正文明确本种在 Indo-Pacific 浅水常见。 | 原引用适合身份/生境，不直接证明完整沉积食性。下方 Hartati et al. 2020 原研究直接证明摄取沉积颗粒上的有机物、碎屑与微底栖生物。配置方向正确，需补食性来源。 |
| 蓝海星 — *Linckia laevigata* | [Linckia laevigata — Lizard Island Field Guide](https://lifg.australian.museum/Group.html?groupId=RtcVGxAf&hierarchyId=)；[Have you seen this starfish? Wanted alive and in colour! — Natural History Museum](https://www.nhm.ac.uk/take-part/monitor-and-encourage-nature/project-archive/have-you-seen-this-starfish-wanted-alive-and-in-colour.html) | LIFG 精确索引、NHM 直接页面都学名相符；NHM 明确印度/西太平洋热带礁区，长而末端圆钝的腕、通常蓝色。 | NHM 明确缓慢运动、管足以及摄食时胃外翻；未给出“藻膜+有机物”完整食谱。当前目录明确功能代理和不确定性，符合证据限度；不应删除此说明。 |
| 马蹄螺 — *Rochia nilotica*（旧名 *Trochus niloticus*） | [Marine Snails Seed Production Towards Restocking Enhancement Basic Manual — FAO，2.2 Topshell, Trochus niloticus](https://www.fao.org/4/ag150e/ag150e03.htm) | 当前页包含多个海螺，必须使用 2.2，不能误读 2.1 Turbo marmoratus；2.2 明确热带/亚热带印度洋至西太平洋浅礁、碎石、礁坪。 | 2.2.3 明确藻坪/大型藻、齿舌刮食；肠内容还包含沉积物及其他材料，因此藻食功能是主功能简化。现配置相符。学名更新另由 WoRMS 确认。 |
| 鹿角珊瑚 — *Acropora muricata* | [Surveys of benthic reef communities using underwater digital photography and counts of juvenile corals — AIMS SOP 10/2008](https://www.aims.gov.au/sites/default/files/Long%20term%20Monitoring%20GBR%20Standard%20Operational%20Procedure%2010.pdf)；[Shallow Coral Reef Habitat — NOAA Fisheries](https://www.fisheries.noaa.gov/national/habitat-conservation/shallow-coral-reef-habitat) | AIMS PDF p.73（0 基页码 72）的 species/benthos 表明确 A. muricata/formosa → Branching Acropora。不是加勒比 A. cervicornis。 | NOAA 支持浅珊瑚清澈温暖流动水及共生藻供能方向；该页不足以独立核验 A. muricata 的形态、生境或异养。下方 Corals of the World 可补本种形态/生境，NOAA Corals Tutorial 可补珊瑚捕食。 |
| 小砗磲 — *Tridacna maxima* | [Small Giant Clam — NOAA Fisheries](https://www.fisheries.noaa.gov/species/small-giant-clam)；[From Coral to Community — Smithsonian](https://3d.si.edu/corals/coral-community) | NOAA 直接页面学名相符，浅珊瑚礁/环礁泻湖，外套膜蓝绿棕相符。 | NOAA 本种页未给出藻共生/滤食；Smithsonian 泛群落页不是本种食性来源，链接标签“与滤食”应调整或替换。Guibert et al. 2020 明确支持滤食和共生藻（下方）。 |
| 礁面藻膜 — *Turf algal assemblage* | [Marine Snails Seed Production Towards Restocking Enhancement Basic Manual — FAO，2.2.2–2.2.3](https://www.fao.org/4/ag150e/ag150e03.htm) | 这是功能群，不是具名物种，目录说明正确；FAO 记录死珊瑚板上的小藻类/藻坪。 | FAO 支持马蹄螺刮食藻坪；本来源不校准藻膜生产率、营养需求、密度或组成。模型将其作为聚合生产者可以保留，须继续称功能群和相对资源。 |

## 已确证可补充的来源

以下 URL 均来自实际检索并核对标题/页面内容，没有猜测数字 ID。

| 用途 | 已确认标题和 URL | 可支持内容 | 核验方式 |
| --- | --- | --- | --- |
| 绿光鳃雀鲷食性 | [Blue-green Puller, Chromis viridis (Cuvier 1830) — Fishes of Australia, 329](https://fishesofaustralia.net.au/home/species/329) | 学名、枝状珊瑚上方群聚、水层浮游动物食性。 | 直接读取 More Info / Feeding。 |
| 清洁虾的本种自然行为 | [The cleaner shrimp Lysmata amboinensis adjusts its behaviour towards predatory versus non-predatory clients — Caves, Chen & Johnsen 2019](https://pmc.ncbi.nlm.nih.gov/articles/PMC6769148/)；[作者机构记录](https://scholars.duke.edu/publication/1411889) | 本种在自然清洁站与客户互动，外寄生物/死组织、面对捕食性客户行为调整。DOI 10.1098/rsbl.2019.0534。 | PMC 全文索引、PubMed 摘要索引及作者机构记录相互核对；直接打开部分出现验证码。 |
| 黑海参沉积食性 | [Feeding selectivity of Holothuria atra in different microhabitat in Panjang Island, Jepara (Java, Indonesia) — Hartati et al. 2020](https://www.smujo.id/biodiv/article/download/5653/3879/21795) | 沉积食者、摄食沉积颗粒/碎屑有机物和微底栖生物。DOI 10.13057/biodiv/d210552。 | 出版方 PDF 直接读取首页摘要与引言。 |
| 马蹄螺当前学名 | [Rochia nilotica (Linnaeus, 1767) — WoRMS/MolluscaBase, AphiaID 1251282](https://www.marinespecies.org/aphia.php?id=1251282&p=taxdetails) | 接受名 Rochia nilotica，旧组合 Trochus niloticus。 | 精确页面索引核对 accepted/original name；直接打开本工具失败。 |
| 鹿角珊瑚本种形态和生境 | [Acropora muricata — Corals of the World](https://www.coralsoftheworld.org/species_factsheets/species_factsheet_summary/acropora-muricata/) | 圆柱枝、丛状群体、礁坡及泻湖、常见奶油/棕/蓝色和浅枝端；条目标为 species complex。 | 直接读取专家物种资料页。 |
| 珊瑚异养 | [What are corals? — NOAA Corals Tutorial](https://oceanservice.noaa.gov/education/tutorial_corals/coral01_intro.html)；[Are corals animals or plants? — NOAA](https://oceanservice.noaa.gov/facts/coral.html) | 珊瑚是动物、触手捕食小动物/浮游动物，多数造礁珊瑚与光合共生藻互惠。不是 A. muricata 专属定量研究。 | 直接读取官方页面。 |
| 砗磲滤食和藻共生 | [Metabarcoding reveals distinct microbiotypes in the giant clam Tridacna maxima — Guibert et al. 2020](https://pmc.ncbi.nlm.nih.gov/articles/PMC7175534/) | giant clams 滤食，共生藻供给大部分碳/能量，明确 T. maxima 的共生藻及本文滤食讨论。DOI 10.1186/s40168-020-00835-8。 | PMC 全文直接读取 Background 与 Discussion。 |
| 蟹的已知珊瑚关系与食谱边界 | [Cymo melanodactylus crabs slow progression of white syndrome lesions on corals — Pollock et al. 2013](https://eprints.jcu.edu.au/24647/) | 宿主 Acropora、可摄取珊瑚组织、偏向病灶的选择和疾病实验；不证明通用碎屑摄食或全部自然食谱。DOI 10.1007/s00338-012-0978-9。 | JCU 原研究记录/摘要索引核对；直接访问工具失败。 |

## SCIENCE.md 的环境来源

| 来源 | 审查结论 |
| --- | --- |
| [Shallow Coral Reef Habitat — NOAA Fisheries](https://www.fisheries.noaa.gov/national/habitat-conservation/shallow-coral-reef-habitat) | 清澈、温暖、流动水及共生藻作用方向相符；不能据此给分钟尺度白化/健康变化参数。 |
| [How far does light travel in the ocean? — NOAA](https://oceanservice.noaa.gov/facts/light_travel.html) | 0–200、200–1000、1000 米以下的通用光分层相符；原文也限定合适条件/光强变化，现文不把 200 米当固定海域阈值的做法合理。 |
| [What is a kelp forest? — NOAA](https://oceanservice.noaa.gov/facts/kelp.html) | 冷、富营养浅水和光限制描述相符；有理由将海带森林作为独立生境。 |
| [Ecology of Marine Snow — MBARI](https://www.mbari.org/project/ecology-of-marine-snow/) | 表层光合碳输入、沉降颗粒支持深海摄食等方向相符。不证明本地浮游资源出入数值。 |
| [What is a hydrothermal vent? — NOAA](https://oceanservice.noaa.gov/facts/vents.html) | 黑烟为细粒矿物、高压抑制沸腾说明相符。当前 `vents.html/volcanoes.html` 在本工具仍返回此文，但应规范为本行已直接核验的 `vents.html`。 |

## 需要落实的调整

1. 为 Chromis 添加 FOA 329；为清洁虾补 Caves 2019；为 Holothuria 添加 Hartati 2020。
2. 砗磲把 Smithsonian 泛群落链接的“滤食”标签移除，使用 Guibert 2020 支持藻共生和滤食。
3. 为 Rochia 添加 WoRMS 学名证据，为 Acropora 添加本种形态/生境页和一般珊瑚捕食来源。
4. 保留蓝海星食谱不确定性；蟹的局部供能代理需与已知宿主组织摄食区分清楚。
5. 将热液 URL 规范为 NOAA `vents.html`。

以上审查发现和已确证链接已发送给主任务及 `ocean_scope` 代理；实际源码修订由其负责。报告不替代源码改动完成后的复核。

## 仍属模型假设的部分

展示尺寸、初始数量与共现、躲避高度、视觉范围、水流成本、资源生产/摄食速率、体能与条件指数均未按野外数据标定。物种数据库记录某个行为存在，并不等于模型已重建其机制或强度。图鉴链接也不授权使用来源页面图片；图片许可需按具体资产另行记录。

## 2026-10-03 补充更正：清洁虾精确形态与当前来源

保留上方原审查记录。原 Smithsonian 存储 PDF 实际是 Rhyne & Lin（2006）对西大西洋薄荷虾复合群的研究，引言 p.165–166 仅举 *Lysmata amboinensis* 为主动清洁虾例子。该链接不足以支持本种精确红白背纹、半透明体侧、尾扇图案，不能把论文中的其他 Lysmata 配色套用于本种。本次已从 `src/species.js` 的清洁虾当前来源项移除该链接，并保留 Caves 等（2019）的本种客户行为研究。

新增来源与读取情况：

- [Georgia Aquarium — Hawaiian Cleaner Shrimp](https://www.georgiaaquarium.org/animal/hawaiian-cleaner-shrimp/) 已直接读取，页面学名为 *Lysmata amboinensis*。Physical Characteristics 明确橙色体色、红色背面、中央白色纵带，附肢为黄至橙色，身体细长、触须纤细。此条目用于当前模型主要识别色；模型透明度和光学参数仍是渲染选择，页面没有给出透射系数。
- [Prakash, Ajith Kumar & Subramoniam（2016），New records of marine ornamental shrimps…，Check List 12(6):2010，DOI 10.15560/12.6.2010](https://doi.org/10.15560/12.6.2010)，**原文印刷 p.4（PDF 第 4 页，0 基页码 3），*Lysmata amboinensis* 段落与 Figure 4**。原采集论文记载黄体色、两侧红色纵带夹着背中纵纹、显著白触须；本种尾节白纹中断，外侧尾肢各有两块白斑，与 *L. grabhami* 的连续白纹区分。本次通过[原论文的 Semantic Scholar PDF 镜像](https://pdfs.semanticscholar.org/e8ed/462be2fbf542c68991d2d6179d9dc40cd3cb.pdf) **真实读取全文**，已核对作者、DOI、印刷页码与物种段落。出版方 Pensoft 直接访问返回 403，Biotaxa PDF 超时，PDF 截图工具也失败；不宣称已查看论文图片像素。物种颜色和尾部标记依据可读取的原论文文字，而非搜索标题或图像猜测。

当前 `cleaner-shrimp.sources` 已更新为 Georgia Aquarium + Prakash（2016）+ Caves（2019）。`organisms.js` 的壳面红白纵纹、橙黄细肢、尾扇斑纹与上述文字依据一致；精确条带宽度、壳面透明度和模型尺寸比例属于可继续校对的制作近似。

