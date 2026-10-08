# 热带礁谷新群落：六种有限代表

本批补充四种礁缘鱼和两种底栖动物的独立形态、实际出生、运动、摄食及持久记录。沿用原地形与全部 v1/v2 出生；这批代表不等于完整天然群落或完整食物网。

| 新物种 ID / 学名 | 形态和生活层 | 选定的当地已有营养池 | seed 50 实际数量 |
| --- | --- | --- | ---: |
| `yellow-boxfish` / *Ostracion cubicus* | 圆角箱形硬甲、散斑、小鳍推动；礁缘水层 | `reefGuild.preyOrganicUnits`：杂食菜单的未解析动物分量 | 2 |
| `red-toothed-triggerfish` / *Odonus niger* | 蓝紫深体、背棘、完整燕尾、小红齿；礁坡水层 | `resources.plankton`：未拆分库存中的浮游动物营养代理 | 4 |
| `longfin-batfish` / *Platax teira* | 非幼体银灰深圆体、眼带、胸鳍下暗斑；礁缘水层 | `resources.algae`：杂食菜单的选定藻类分量 | 3 |
| `valentini-puffer` / *Canthigaster valentini* | 小型尖鼻圆腹、四黑鞍、小鳍；礁缘水层 | `reefGuild.preyOrganicUnits`：杂食菜单的未解析动物分量 | 2 |
| `peacock-mantis-shrimp` / *Odontodactylus scyllarus* | 分节甲壳、眼柄、两只折叠击肢、三对步足、尾扇；真实礁旁稳定裸底 | `reefGuild.preyOrganicUnits`：未解析动物营养分量 | 2 |
| `green-turban-snail` / *Turbo marmoratus* | 杂斑厚螺旋壳、壳口与厣、连续肉足、双触角；真实稳定礁岩 | `resources.algae`：当地藻类有机分量 | 3 |

三条库存分别实际扣款并保存摄食记录；没有新增食物库存、可见动物捕杀、壳破裂、空化冲击或完整浮游动物食物网。箱鲀、蝙蝠鱼与尖鼻鲀的选定营养分量不代表它们完整的天然杂食菜单。自然物种密度、显示尺寸、运动和摄食速率均未作野外校准。

## 出生和历史

只有真实 v8 礁谷整组十二个 owner 全部严格没有记录时，才原子保存并公开 v3 群落。完整运行原 v1/v2 出生后，在自然余量中按 owner 轮换加入新种；每 owner 礁谷居民合计最多六条，含前两批居民。每 owner 全部动物记录仍最多二十条，包含死亡记录和海龟；物理不适合或余量不足时允许少生。

完整身体、尾鳍、眼柄、触角、螺壳、深度和动态包络均参与净空检查。螳螂虾六个足点对应三对真实步足；螺的六个支撑样本属于同一连续肉足，不能称六条腿。旧 v1/v2 历史、死亡、食品库存、时钟和随机状态保持；不迁移或补货。演示使用 `?demo=reef-valley-region&seed=50`，已有同种子历史仍保留。

## 当前原生证据

独立 fresh string 50 的目标十二 owner 实际路径 **424.333 米**，全组 **222 条动物记录**，本批六种共 **16 只**。起点箱鲀约 **2.56 米**、红齿鳞鲀约 **7.83 米**；其他新种沿路出现，螳螂虾约在路径 **261.72 米**、绿色蝾螺约在 **401.08 米**进入十四米近邻。近邻距离是 CPU 空间采样，不保证屏幕中可见或无遮挡。

三普通九区窗口合计 **9 模型秒**，16 个新个体中 **15 移动、15 摄食**。螳螂虾 2/2 移动与摄食；绿色蝾螺 2/3 移动、3/3 摄食；尖鼻鲀 2/2 移动、1/2 摄食。未移动或未摄食结果保留。原地形与全部前两批出生完全一致，完整冷恢复一致；原生记录见 `output/validation/reef-community-native.json`。

两种底栖资产的 **6/6** 有限原生检查通过：实际 Three 几何和动态包络、真实固定接触点、原生时钟与记录只读、共享资源独立姿态，以及挂载后的卸载释放。浏览器/GPU 观感、遮挡和帧率尚未验收；构建、完整云端回归及发布状态由本批实际运行另记。

## 物种资料

- Museums Victoria / Fishes of Australia：[箱鲀](https://fishesofaustralia.net.au/home/species/2474)、[圆脸蝙蝠鱼](https://fishesofaustralia.net.au/home/species/2210)、[黑鞍尖鼻鲀](https://fishesofaustralia.net.au/home/species/861)。形态、食谱及阶段资料用于物种区分，未直接校准模拟速率。
- [Australian Museum 红齿鳞鲀](https://australian.museum/learn/animals/fishes/redtooth-triggerfish-odonus-niger/)：物种形态、礁坡水层与主要浮游动物食性。
- [University of Texas 螳螂虾作者 CT 样本](https://www2.geo.utexas.edu/specimens/Odontodactylus_scyllarus/whole/)、[FFESSM DORIS 作者物种资料](https://doris.ffessm.fr/Especes/Odontodactylus-scyllarus-Mante-de-mer-paon-1892)：击肢、三对步足、腹部附肢和礁旁沙碎屑底。洞穴只作参考，本批不生成或宣称占据真实洞穴。
- [FAO 绿色蝾螺移植调查](https://www.fao.org/fishery/docs/CDrom/aquaculture/a0845t/volume2/docrep/field/003/ac292e/AC292E01.htm)：植食与二十厘米以上壳宽资料。SPC 种资料仅读取索引摘要，页面打开错误未称阅读全文。

本批共 104 个唯一定向 case 全部通过（新控制器8、四鱼资产8、两底栖资产6、完整原生生态4、显示与入口45、原控制器和入口33），重复检查不累加。独立完整生产选项普通入口12-null生成也确认222条记录及16只新动物；首九窗1秒88实际个体位移/36摄食，新个体8移动/2摄食。该1秒probe与三窗口9秒不是同一连续世界，不累计。一次构建9.60秒通过，独立4175预览更新。旧v1/v2完整32步before/after记录逐字节一致；旧catalog与资产保持。本提交的160文件/计划1055项完整云端检查及Pages发布以新运行实际状态为准。
