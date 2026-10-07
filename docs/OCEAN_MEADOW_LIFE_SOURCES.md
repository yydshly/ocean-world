# 浅海草床、沙底与礁边四类动物的来源与实现界限

2026-10-07。对应 `src/oceanMeadowLifeSpecies.js` 的四个固定 ID。这是印度—西太平洋范围内的有限代表组合，依据各自微生境生成；没有声称四种动物曾在同一调查样方共同出现。相邻草床、开阔软底和稳定礁边可提供不同机会，符合条件仍可以没有某一类。

## 身份、尺度和选定水深

| ID | 身份 | 本版尺度，单位米 | 尺度口径 | 本版水深，单位米 |
| --- | --- | --- | --- | --- |
| `sand-edge-seahorse` | *Hippocampus kuda* s.l.复合群形态代表 | 0.10–0.16；默认0.13 | 冠顶至未卷曲尾尖的高度 | 3–15 |
| `reef-cuttlefish` | *Ascarosepion latimanus*，旧组合 *Sepia latimanus* | 0.16–0.24；默认0.20 | 外套膜长，不含头、腕、触腕 | 3–18 |
| `barrel-sea-pen` | *Cavernularia obesa*，2026核对形态 | 0.08–0.12；默认0.10 | 整段群体身体长，包括埋柄 | 5–15 |
| `spider-conch` | *Lambis lambis* | 0.12–0.18；默认0.15 | 壳长，不是动物总长 | 3–10 |

这些是有限展示选择，既不是完整自然尺寸分布，也不是物种完整水深范围。`lengthM` 只是选定口径的默认尺寸，必须同时读取 `sizeMeasure`，不能统一解释成动物全长。温度、盐度、溶氧耐受、年龄、流速、密度及运动/摄食校准字段保留 `null`；场景当时的环境读数不等于物种耐受实验结果。

## 草床海马

[Project Seahorse/TRAFFIC原作者鉴定指南（2004）](https://projectseahorse.org/wp-content/uploads/2021/06/Seahorse_ID_Guide_2004.pdf)印刷页8定义高度口径，页9给标注完整解剖图，页64–65是旧 *H. kuda* 账户，页103讨论名称混用，页112提供颜色参考。旧账户典型水深0–8米、最深报道55米、高度参考上限17厘米；这些资料的身份范围不能提升成所有谱系共享的界限。模型明确使用 `species-complex-representative`，中文入口也保留“复合群代表”。本版3–15米是报道水深内的展示选择，不能把9–15米表述为已调查的当地草床群落或某一谱系范围。

完整形态参照弯颈、深体、粗管吻、低圆冠和抓握尾；实际卷尾外观高度低于未卷尾尺度。[Smithsonian菲律宾Mindoro活体记录](https://www.si.edu/object/hippocampus-kuda%3Anmnhvz_5294935)标注0–5米与旧名称，可辅助整只动物参考，不能证明程序个体遗传身份。图像权利归原来源，本版没有下载或复制照片作为贴图。

[2008原始摄食试验](https://ija.scholasticahq.com/article/20489.pdf)及其自然食物背景支持小型活甲壳动物食性；不把幼体水槽投喂、生长或存活系数迁入野外场景。实现仅使用旧 `reefGuild.preyOrganicUnits` 的甲壳动物营养代理分量，实际尾端必须抓在原生静态草叶端点附近。没有草叶时不虚造一个宿主。

## 礁乌贼

[WoRMS/MolluscaBase当前分类记录](https://www.marinespecies.org/aphia.php?id=1667002&p=taxdetails)接受 *Ascarosepion latimanus*，旧 *Sepia latimanus* 是历史属组合。[FAO原作者头足类鉴定资料](https://www.fao.org/4/a0150e/a0150e10.pdf)印刷页91–92、图148给完整背/腹面及触腕端部；说明热带浅珊瑚礁、水深至30米、外套膜长可达50厘米，食物包括鱼和甲壳动物。历史账户同时保留可能存在复合群的疑问；程序代表不宣称当地样本已经遗传定种。

[澳大利亚博物馆Lizard Island标注活体图库](https://lifg.australian.museum/Group.html?groupId=06x7MW0Y&hierarchyId=qBHH2Q3E)辅助整只乌贼形态和褐色浅斑参考。模型必须保留宽外套膜、侧鳍、独立头部、八腕和两条棒状触腕；外套膜归一化长轴为1，其他部分额外进入包络。它在实际礁体/稳定碎石附近活动，以完整身体和俯仰检查净空。摄食只消费原底栖动物库存中的甲壳动物代理分量，没有同时捕杀可见鱼的实现，也没有完整色素胞、偏振视觉和繁殖系统。

## 棒状海鳃

[Heung等2026原始整合分类研究](https://pmc.ncbi.nlm.nih.gov/articles/PMC12971188/)的 *C. obesa* 系统账户及图2B（凭证SCSMBC240208，30毫米标尺）提供核对后的完整棒状形态：没有中央硬轴。香港采集水深4.8–15米，所检标本身体长37–128毫米。这是采集标本尺寸，不能称为充分伸展活体高度；本版8–12厘米整段身体包括埋柄。

[Mori与Tanase1973原始节律研究](https://repository.kulib.kyoto-u.ac.jp/dspace/bitstream/2433/175765/1/fia020_455.pdf)和[韩国海洋水产部2023说明](https://www.mof.go.kr/doc/ko/selectDoc.do?=&bbsSeq=10&docSeq=49396&menuSeq=971)支持沙泥底、昼藏夜间展开摄食的定性行为。模型约四分之一身体埋入软底是展示比例，没有现场埋深校准；不附着岩顶或海草冠，也不借用其他海鳃的水平地下移动。收缩及摄食取区域自然昼夜，不能由导演镜头时间代替。

[政府委托的海洋保护研究资料](https://ukmpa.marinebiodiversity.org/uk_sacs/communities/seapens/sp1_2.htm)提供八放类八条羽状触手和海鳃悬浮摄食的高阶功能依据；不把英国物种的分布或羽枝骨架移给该棒状种。现有 `region.resources.plankton` 作为未分辨悬浮营养代理；`basicNetwork`与`resources`为独立字段，前者提供物质账。尚无该种胃含物分析、实测浮游动物数量或滤水速率。

政府旧名称资料有受刺激发光报道，[CoGFP原始研究](https://pmc.ncbi.nlm.nih.gov/articles/PMC3884763/)则研究荧光蛋白；荧光证据不能单独证明生物发光。2026分类研究还指出某些标为 *C. obesa* 的公开序列与 *C. solaris* 混淆。因此所选形态的自然发光真假留 `null`，保留旧名报道限制，当前不开材质自发光、刺激发光或光合供能。

## 蜘蛛螺

[FAO肯尼亚原作者鉴定指南](https://www.fao.org/4/i2741e/i2741e05.pdf)印刷页37给 *L. lambis* 标注完整壳图：厚壳、六个外唇指突、独立前水管沟，壳长参考上限29厘米、常见18厘米；礁坪、珊瑚碎石或红树林环境与细红藻食性。[FAO缅甸原作者指南](https://openknowledge.fao.org/server/api/core/bitstreams/f32d004b-6358-44f3-8242-b9d23e5346d0/content)同种近岸条目另给约5米浅水上限。

[Alf与Wieneke2023作者上传原始文章](https://www.researchgate.net/publication/373113694_Conchylia_54_1-2_Juli_July_2023_43_An_interesting_form_of_Lambis_lambis_LINNAEUS_1758_and_remarks_on_Lambis_vertriesti_DEKKERS_MAXWELL_2022_Caenogastropoda_Littorinimorpha_Strombidae)页46 Plate2图1，单独标注Queensland潜水员于2002年在10米取得的 *L. lambis* 壳（沿轴25厘米）。它是采集记录，不是活体种群调查，也不证明固定尺寸比例；同页图2的7–12米是 *L. lambis × millepeda* 杂交型，明确排除。本版据前一记录选择3–10米，保持典型六指突形态，保留作者对隐存种边界的讨论而不宣称遗传确认。

[澳大利亚博物馆Lizard Island图库](https://lifg.australian.museum/Group.html?groupId=PT5tJtG5&hierarchyId=PVWrQCLG)可辅助足、眼柄、吻及礁边碎石下完整动物参考。[2011 Cocos原始栖息地研究](https://www.int-res.com/articles/meps2011/432/m432p083.pdf)显示宏藻/礁体关联及与海草环境的差异，不能因本包名称而强制它在草叶上出现或取食海草。本版支持查询使用原生岩石完整三角面，含完整壳、足、指突及有界伸出部分，不能用软砂通用地面代替。礁边碎石/藻场为自然生境背景，食物是原有 `region.resources.algae` 代理；没有解析的红藻斑块、完整红藻种群或天然密度模型。

## 完整包络与字段合同

所有归一化包络以各自 `sizeMeasure` 选定尺寸乘回米制，+X朝前、+Y朝上、Z横向。`horizontalRadiusUnits` 仅作宽相筛选，不能代替轴向全身或俯仰、地面支持、转身检查。下列范围是保守程序包络，不是文献测量比例。

| ID | X | Y | Z | 横向半径 | 根参考 |
| --- | --- | --- | --- | --- | --- |
| `sand-edge-seahorse` | −0.30…0.42 | −0.12…0.72 | −0.14…0.14 | 0.46 | 卷尾抓握点，局部(0,0,0) |
| `reef-cuttlefish` | −0.60…1.28 | −0.32…0.32 | −0.48…0.48 | 1.38 | 外套膜中心 |
| `barrel-sea-pen` | −0.25…0.25 | −0.30…0.82 | −0.25…0.25 | 0.36 | 软底表面；负Y为有意埋柄 |
| `spider-conch` | −0.60…0.82 | 0…0.70 | −0.70…0.70 | 1.08 | 足接触底面 |

目录沿用已有动物目录的 `id/commonName/scientificName/kind/guild/lengthM/sizeRangeM/sizeMeasure/depthSelectionM/referenceSizeM/referenceDepthM/normalizedEnvelope/colors/description/diet/behavior/substrate/habitat/morphology/sources`，增加 `modelRole`、可读尺寸定义、`support`、结构化 `feedingProxy`、`sourceLinks` 和环境未知字段。两个具名导出及全部嵌套元数据冻结。生产模型按明确 `modelRole` 分派，不通过拉丁学名猜行为。

只消费原owner库存，不创建新营养池，不用数量/节律/外观随机值冒充实际测量，不保证全类别同区或同一入口出现。完整自然食谱、总体物种丰富度和浏览器/GPU整景观感没有由这份来源目录建立验收。
