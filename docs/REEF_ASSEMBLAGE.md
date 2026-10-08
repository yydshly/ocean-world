# 浅礁新组合：长体鱼、贴底扁鱼、芋螺与短棘海胆

本批增加六种此前目录未有的独立物种，补充不同身体轮廓和生活层。尺寸均为本版选择，天然最大尺寸、展示包络、出生密度和运动摄食速率不混为一项；不是当地完整野外调查或校准种群模型。

| 新物种 / 学名 | 选定尺寸，测量含义与完整形态 | 实际选定生境 / 已有食物代理 | fresh 54 实际出生 |
| --- | --- | --- | ---: |
| `giant-moray` / *Gymnothorax javanicus* | 0.9–1.3m 全长；长厚斑体、连续背尾臀鳍、管状鼻孔，无胸腹鳍 | 3–18m 实际近礁水层 / `reefGuild.preyOrganicUnits` 选定鱼类营养 | 3 |
| `banded-pipefish` / *Dunckerocampus dactyliophorus* | 0.12–0.17m 全长；长管嘴、矩形骨环直体、环纹与红白扇尾 | 5–18m 受保护礁缘 / 未解析动物池中的选定浮游甲壳营养 | 2 |
| `spot-fin-porcupinefish` / *Diodon hystrix* | 0.30–0.45m 正常未充气全长；全身与鳍黑小斑、完整卧伏长棘 | 3–18m 沙礁缘水层 / 选定海胆、螺和蟹类营养 | 2 |
| `peacock-flounder` / *Bothus mancus* | 0.22–0.32m 全长；扁椭圆完整鱼体、左上面双眼、蓝环斑和鳍尾 | 3–18m 真实裸沙 / 选定底栖无脊椎与小鱼营养 | 2 |
| `textile-cone` / *Conus textile* | 0.055–0.075m **壳长**；尖螺塔、圆肩、白三角织纹、长壳口与连续肉足 | 3–18m 真实沙礁缘 / 选定软体动物营养 | 2 |
| `collector-urchin` / *Tripneustes gratilla* | 0.065–0.085m **test硬壳横径，不含棘**；圆拱硬壳、十列短棘带与五步带管足 | 3–15m 实际稳定裸露硬质藻礁缘 / `resources.algae` 选定宏藻营养 | **0** |

海龙旧组合 *Doryrhamphus dactyliophorus* 不另计新增。扁鱼使用热带 *Bothus mancus*，不拿大西洋 *B. lunatus* 替代；海胆使用热带 *T. gratilla*，不混入亚热带 *T. kermadecensis*。

三底栖均 `+X` 向前，真实接触面 `y=0`：扁鱼为无眼的**右侧皮肤**六个采样点，不能称腹面、脚或步足；芋螺为一个连续肉足的六个采样点；海胆为十二个真实管足吸盘尖，棘和中央口都不作支撑。芋螺壳长单独测量，肉足、水管、短收缩口吻和触角都纳入完整空间包络。海胆硬壳直径单独测量，短棘、管足及软附器另计净空。

模型只读保存的个体时钟以显示有界附肢活动，根位置和全身移动由原生控制器负责。固定皮肤、肉足或管足参考采样不等于天然推进步态；没有扁鱼埋沙或自由游泳、芋螺射毒齿猎杀、海鳗假洞、海龙配对洞栖、刺鲀充气或海胆捡拾遮盖物。仅扣除当地实际已有的两个营养代理，未区分具体猎物与宏藻物种，也未复现完整天然食谱。

## 新世界选择与历史

仅 v8 礁谷十二个 owner 严格全无存档时启用 v6，并在整组原子保存成功后公开。旧 v1–v5 历史不升级、不补发。新世界在原非居民后每 owner 自然余量中最多预留两个位置，先在受限容量内运行完整 v4 居民流程，再交错选择 v5 与 v6 的十二种候选；不叠加两次预留，不放宽实际底质、全身净空或食物门槛。每 owner 居民最多十条、全部动物记录最多二十条，包含死亡与海龟；九活区、二十五公开支撑与九十七私有预读边界保持。

fresh 54 的完整 v1–v4 居民出生与原非居民出生保持相等。新世界组合相对独立 v5 基线不同：v5 基线有二十二只该批动物，本组合选择十二只；十二个旧基线 ID 未选择，另两条被选择记录有差异。该差异仅属于全新世界选择，不能宣称全部 v5 新生记录逐字节保持；已有 v5 死亡、资源、时钟及后续输出原生核验保持完整相等。

## 有限原生结果

fresh `?demo=reef-valley-region&seed=54` 实际十二 owner 共 **233 条动物记录，本批 11 只**。五种实际出生的新增类群各在主路某处进入 CPU 十四米近邻；**集物海胆未出生**，本轮没有换种子搜索或强制放宽门槛。目录与模型支持六种，不代表这一条路线出生或展示齐六种。

只读诊断保留该否定结果：九个 owner 在海胆候选前已占完位置，另三个实际尝试全部宿主。208,4与209,4可用平坦位置深16.208–23.190m，超过所选3–15m；206,5其余位置不满足稳定硬底、深度或净空，唯一通过全部地形深度门槛的13.196–13.331m位置已被先出生的疣状叶海蛞蝓占用。详见[本批冻结收据](../output/validation/reef-assemblage-delivery.json)中的 `collectorNative54Diagnosis`。

三个普通九区窗口合计 **9 模型秒**：11 个新个体全部移动，10 个摄食；刺鲀仅 1/2 摄食，其余出生种均全部摄食。完整活区与磁盘冷恢复相等，原子保存失败不公开、损坏记录拒绝再生。四个唯一原生 case 成功：初轮三个未变成功结果复用，首项修正“每种必出生”的错误验收假设后单独复验成功；初轮失败保留，生产未为断言改动。另一次独立生产入口首窗 1 秒：全体 115 移动、47 摄食，本批 5 移动、0 摄食，不与九秒结果累加。

三底栖资产首轮 **6/6 CPU case** 通过，检查完整静态与动态每顶点包络、准确测量轴、实际接触顶点、连续皮肤与肉足、非发光有限材质、时钟只读、共享资源及挂载后移除与释放。原始日志在本地保留；[冻结收据](../output/validation/reef-assemblage-delivery.json)记录检查计数和日志哈希。上述距离、运动和几何证据没有确认 GPU 遮挡、画面可见度、整体观感或帧率。

本批共137个唯一定向检查成功，生产构建4.27秒通过；其中原生生态四个唯一case使用三个初轮未变成功结果加首项单独复验，未把初轮失败重复计入成功总数。云端检查与发布以实际运行记录为准。

## 作者资料

- Museums Victoria / Fishes of Australia：[巨海鳗](https://fishesofaustralia.net.au/home/species/2041)、[环纹海龙](https://fishesofaustralia.net.au/home/species/3178)、[斑鳍二齿鲀](https://fishesofaustralia.net.au/home/species/476)；FFESSM DORIS：[巨海鳗形态](https://doris.ffessm.fr/Especes/Gymnothorax-javanicus-Murene-javanaise-1564)、[海龙旧组合与食性](https://doris.ffessm.fr/Especes/Dunckerocampus-dactyliophorus-Syngnathe-zebre-2319)。
- [FAO 西中太平洋鱼类指南 Bothus mancus，印刷页3816](https://www.fao.org/4/y0870e/y0870e45.pdf)与[DORIS豹纹鲆](https://doris.ffessm.fr/Especes/Bothus-mancus-Rombou-tropical-5440)：实际左眼、白色右盲侧与礁缘沙底。不同作者最大体长42cm和51cm分别保留，不将其直接当展示尺寸。
- [DORIS织锦芋螺](https://doris.ffessm.fr/Especes/Conus-textile-Cone-drap-d-or-1184)：本种常见50–80mm壳长、约50m内沙礁缘、长水管与软体动物食性；不将芋螺属其他种的鱼食或虫食套给本种。
- [DORIS集物海胆](https://doris.ffessm.fr/Especes/Tripneustes-gratilla-Oursin-bonnet-de-pretre-3045)：短棘、真实管足、浅礁潟湖与宏藻海草食性；来源16cm“直径”没有明确排除棘，不能认作test最大径。[原作者集物行为研究](https://pmc.ncbi.nlm.nih.gov/articles/PMC4830529/)索引中的方法段明确本种6.5–8.5cm test diameter，全文访问受验证页限制，引用用于选定展示范围而非野外体型分布；[Australian Museum分类研究说明](https://australian.museum/get-involved/amri/amri-student-forum/sea-urchin-genus/)区分热带gratilla与亚热带kermadecensis。
