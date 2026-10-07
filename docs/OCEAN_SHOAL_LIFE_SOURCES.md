# 浅礁水层鱼群与游弋动物：来源与实现边界

本批只增加四个具名形态代表，补充礁上水层的宏观生命层次。三种鱼可组成有限同种群体，黑鳍礁鲨采用可选单体。四者属于热带印度—西太平洋的地区代表，不声称来自同一地点的一次野外调查。初选中的 `Sepioteuthis lessoniana complex` 和 `Phyllorhiza punctata` 已存在，故未重复加入；已有 `Caesio cuning` 与本批 `Caesio teres` 为不同物种，但生态功能有重叠。

来源目录为 `src/oceanShoalLifeSpecies.js`，导出 `oceanShoalLifeSpeciesCatalog` 和 `oceanShoalLifeSpeciesById`。所有选择范围均属于有限展示配置；来源记录、完整自然范围、实际模型个体水深分别表达。

| ID / 学名 / 中文名 | 本版选择尺度 | 本版完整个体水深 | 水层角色与来源限制 |
| --- | --- | --- | --- |
| `blue-and-gold-fusilier` / *Caesio teres* / 黄蓝背乌尾鮗 | 22–30cm TL | 5–15m | 礁上中层浮游食物群游代表；自然账户5–50m、40cm TL。 |
| `bigeye-trevally` / *Caranx sexfasciatus* / 六带鲹 | 35–55cm TL | 3–15m | 昼间慢速群游的动物食性鲹；礁生境报道至约100m，TL依据独立原创指南。 |
| `silver-stripe-herring` / *Spratelloides gracilis* / 日本银带鲱 | 6–7.5cm TL | 1–3m | 细长银带浅水群游代表；选择水深依据菲律宾0–3m采集标本，非当地活体群体普查。 |
| `blacktip-reef-shark` / *Carcharhinus melanopterus* / 黑鳍礁鲨 | 80–120cm TL | 3–15m | 单体游弋代表；不强制群游，不声称所有选择个体已成熟。 |

TL 是从吻尖到最远尾尖的完整全长，FL 是吻尖到尾叉点的尾叉长，SL 是吻尖到尾鳍基部的标准体长。本批直接找到各自 TL 来源；没有使用统一换算系数，也没有把文献 FL 或 SL 数字改标 TL。

## 黄蓝背乌尾鮗：蓝黄中型群游鱼

[Museums Victoria / Fishes of Australia 的 *Caesio teres* 账户](https://fishesofaustralia.net.au/Home/species/1233)明确标注40cm TL、5–50m，热带印度—西太平洋分布，并说明在礁上中层组成大群摄食浮游生物。其带学名的 Queensland 活体照片为完整鱼体参考：蓝背、银白腹，后上背和后段背鳍、深叉尾呈黄色；颜色存在地区变异。本版22–30cm和5–15m取该资料内的有限展示范围。

[冲绳美丽海水族馆官方中文图鉴](https://churaumi.okinawa/sp/sc/fishbook/1489653956/)将学名 *Caesio teres* 与“黄蓝背乌尾鮗”对应，另说明其浮游食物分量。该中文名优先于未经核对的“双带”等名称。程序只消费 `region.resources.plankton`，不将粗粒度库存称作特定浮游动物数。

## 六带鲹：较大的银灰群游鱼

[日本国立科学博物馆的原创 Lombok 鱼类指南](https://www.kahaku.go.jp/research/db/zoology/FishGuide/data/fish207.html)明确列 *Caranx sexfasciatus* 最大80cm **total length**，同时提供命名完整标本和形态鉴别。照片自己的13.2cm是 **SL**，未用其照片标尺推算展示鱼 TL。完整形态包括长椭圆压扁体、大眼、两段背鳍、长胸鳍和深叉尾；成体银灰、背臀叶白端、鳃盖小黑点，与幼体黄身5–6暗条带区别开。

[Museums Victoria 账户](https://fishesofaustralia.net.au/home/species/1654)支持成体珊瑚礁生境、白天慢速大群和夜间/黄昏摄食鱼、头足类与甲壳动物。它列的78cm最大值和60cm常见值明确为 **FL**，目录另外保存，未转换成TL。[台湾鱼类资料库](https://fishdb.sinica.edu.tw/chi/species.php?gen=Caranx&spe=sexfasciatus)用于核对“六带鲹”与0–100m；未采用其中未注明测量口径的120cm。两账户对夜间模式描述并不完全一致，因此本版保留定性来源，未硬编码当地鱼群每晚的固定休眠或解散规则。

[澳大利亚博物馆 Lizard Island 的命名现场照片](https://lifg.australian.museum/HotShot.html?resourceId=CMhpffGR)标注 Cobia Hole 的 *C. sexfasciatus* 鱼群，可作整体群游形态参考。模型消费 `region.openWaterLife.preyOrganicUnits` 的选定游泳动物营养代理；不从可见鲱鱼或乌尾鮗个体扣死亡，不宣称完整捕食过程已实现。

## 日本银带鲱：小型近圆柱银色群游鱼

[Whitehead、Boeseman、Wheeler1966原创模式材料复核](https://repository.naturalis.nl/pub/317728/ZV1966084001.pdf)在 *Clupea argyrotaeniata* = *Spratelloides gracilis* 条目分别列SL与全长：Leiden材料全长46.3至约77mm；其中上端为近似值。6–7.5cm TL只是该全长材料中的展示选择，未按标本数量推断活体群密度。[原文机构书目记录](https://repository.naturalis.nl/pub/317728)保留作者、年代与全文入口。

[Whitehead1985原作者FAO账户](https://www.fao.org/4/ac482e/ac482e09.pdf)印刷页34–35支持银色侧带、近岸群游和印太分布；其9.5cm尺寸明确为 **SL**，不作为本版10cm TL的依据。[Smithsonian 的1987菲律宾标本](https://www.si.edu/es/object/spratelloides-gracilis%3Anmnhvz_5182417)给出Batan岛Balugan Bay、1987-04-23、采集水深0–3m。本版仅选择1–3m真实水层，没有将单标本改写为完整自然深度范围、活体照片证明或鱼群共存普查。

[台湾水产试验所2023研究介绍](https://www.tfrin.gov.tw/theme_data.php?id=1322&sub_theme=special_message&theme=book_data)核对中文名、泻湖/面海礁区群游及矽藻、橈足类等浮游食物；本版取 `region.resources.plankton` 的未分辨营养代理。[Hata和Motomura2020原创分类论文](https://www.museum.kagoshima-u.ac.jp/ichthy/INHFJ_2020_003_010.pdf)提供当前Spratelloididae科处理和Fig.1完整鲜鱼照片；照片71.2mm是SL，未当作本版TL。[博物馆Lizard Island命名鱼群照片](https://fishesofaustralia.net.au/home/species/2069)用于浅礁银带群体外形参考。细长身体、连续银色侧带与完整叉尾须同时存在，不能仅渲染无头尾的亮点。

## 黑鳍礁鲨：较大单体游弋动物

[Compagno1984原作者FAO资料](https://www.fao.org/4/ad123e/ad123e28.pdf)印刷页488–489给出 *Carcharhinus melanopterus* 完整体形、浅礁和更深水中层/近底活动、鱼与无脊椎食物，并明确其可单体或小群出现，非强群游。PDF上一页属于另一物种，其尖吻、食性或小尺寸不能借用。关键完整形态是短钝吻、五对鳃裂、两背鳍、臀鳍、胸腹鳍和异型尾；第一背尖、下尾叶黑斑及近端白界区别于其它“黑鳍鲨”。

[FRDC2023官方种报告](https://fish.gov.au/docs/SharkReport/2023_FRDC_Carcharhinus_melanopterus_final.pdf)明确至少180cm **TL**，本版选80–120cm，不据此赋年龄或成熟状态。[Museums Victoria 账户](https://fishesofaustralia.net.au/home/species/1952)列0–75m且通常浅于40m；3–15m属于浅礁游弋选择，而非完整自然分布。[澳大利亚博物馆的Fiji命名活体照片](https://australian.museum/learn/animals/fishes/blacktip-reef-shark-carcharhinus-melanopterus-quoy-gaimard-1824/)用于完整轮廓和鳍尖颜色参考。本版消费既有 `region.openWaterLife.preyOrganicUnits`，不补造鲨鱼食物、追杀可见群鱼或把粗粒度库存称作真实完整食物网。

## 几何、准入与真实性合同

全部资源以全长中点作根，+X朝吻端、+Y向上、Z横向；中性姿态吻尖与最远尾尖的X分别为+.5与-.5，TL归一为1。fish完整动作包络为X±.55、Y±.25、Z±.25，水平半径.61；shark为X±.55、Y[-.20,.35]、Z±.40，水平半径.69。它们是未校准的保守碰撞/净空设计，包含鳍和有限尾摆，**不是文献实测生物比例**。旋转或俯仰后的完整包络仍须通过地形与水深检查。

原生海床约11–20m深不能直接作为群鱼水深。日本银带鲱可以在海面下1–3m的水层游动，其全身必须同时留在允许范围内。目录不改变海床、岩体、海面或出生点以强制四类同区出现，未通过实际水层准入的类别允许自然缺失。

每个出生个体都是独立模拟动物，有自己的标识、organic库存、时钟、位置与摄食收据。同种5–7条与可选单鲨、最多8个新个体属于有限软件预算；并非自然大型鱼群数量、密度或当地采样。对代理库存为零的区域，搜索与缺食是有效结果，不能为了演示强加食物。

速度、群体距离、代谢、生长、摄食系数和年龄均未生态校准；自然密度、年龄、温度/盐度/溶氧耐受、流速、繁殖等未知字段保持`null`。本批形态是程序化代表，未声称遗传鉴定、3D扫描、同一地点全生态复原、实测种群恢复或浏览器/GPU画面验收。渲染不产生食物，导演时间不代替区域生态时钟。
