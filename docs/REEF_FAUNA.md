# 热带礁谷动物：六种新轮廓

本批增加三种礁缘鱼与三种底栖动物的独立形态、实际活动和持久记录。六个学名均未重复既有物种；已有白天章鱼和大鳍礁乌贼没有换名计作新增。模型尺寸使用米，形态与适生条件参考作者物种资料，显示尺寸、速率和密度仍是有限实现选择。

| 新物种 / 学名 | 选定尺寸与完整形态 | 实际生活层 / 当地已有营养代理 | fresh 52 出生 |
| --- | --- | --- | ---: |
| `humphead-wrasse` / *Cheilinus undulatus* | 0.85–1.15m 全长；额隆、厚唇、绿色厚体和圆尾 | 10–18m 近礁水层 / `reefGuild.preyOrganicUnits` 选定动物营养 | 5 |
| `bluespine-unicornfish` / *Naso unicornis* | 0.40–0.55m 全长；短额角、尾柄蓝骨板和刀棘 | 3–18m 礁缘水层 / `resources.algae` 选定宏藻营养 | 5 |
| `clown-triggerfish` / *Balistoides conspicillum* | 0.30–0.40m 全长；成年黑底白大斑、黄网纹和橙唇 | 3–18m 礁缘水层 / 选定动物营养 | 4 |
| `shame-faced-crab` / *Calappa hepatica* | 0.05–0.075m 背甲宽；宽拱壳、后侧壳盾、遮面大螯与四对步足 | 3–18m 真实裸沙、贝砂或草缘裸底 / 选定软体动物营养 | 3 |
| `wedge-sea-hare` / *Dolabella auricularia* | 0.10–0.16m 身体全长；褐绿楔体、扁后盘、双水口、两口触角及两嗅角 | 3–15m 受保护沙草缘 / 选定藻类营养 | 3 |
| `varicose-phyllidia` / *Phyllidia varicosa* | 0.05–0.08m 身体全长；灰蓝纵脊、黄顶背瘤、两黄嗅角及腹裙下鳃片 | 5–18m 实际稳定硬礁面 / 未解析动物池中的选定海绵营养 | 4 |

鼻鱼来源的 70cm 是叉长 FL，不直接换算为本模型全长 TL。蟹的背甲宽不含步足或螯。三底栖模型均以实际触底平面 `y=0`、`+X` 向前，使用完整身体与附肢动态包络：蟹八个真实步足尖，大螯举起不作足；两种软体动物各六个采样点来自一个连续腹足，不能称六条腿。海兔内部壳不做外露盘旋壳，固定腹足参考不等于已还原前伸后收步态。叶海蛞蝓没有背部羽鳃圈，也没有普通海兔式齿舌。

两个现有库存实际扣款并保留摄食记录。海绵营养尚未拆成具体海绵物种库存；未实现可见猎物捕杀、碎螺壳、真实埋沙、喷墨、海绵几何损伤或完整自然食物网。显示附肢只读保存的个体时钟，原生控制器负责根位置和实际全身运动，卸载移除父节点并释放共享资源。

## 新世界与历史

只有 v8 礁谷整组十二个 owner 严格全无存档时，才采用 v5 并原子保存后公开。旧 v1–v4 存档、死亡、库存、时钟与后续行为保持，不升级、不补货。为避免原居民占满新世界，本版先从原动物后的自然余量中每 owner 最多预留两个位置，再在受限容量内运行旧居民出生流程，最后尝试新物种；余量和完整物理条件不足时允许少生。每 owner 居民合计最多十条，全部动物记录最多二十条，包含死亡和海龟；保持九活区、二十五公开支撑 owner 与九十七私有预读上限。

新世界的组合因此与无限制 v4 新生基线不同：fresh 52 保留原地形、全部原非居民出生和每条被保留的旧居民记录，但相对完整 v4 基线少选择二十条旧居民出生。这不是删除既有存档动物，不能宣称新世界全部旧居民出生也逐字节相同。

## 有限核验

新参数 `?demo=reef-valley-region&seed=52`；同种子已有历史仍保持。独立 fresh 52 十二 owner 路径 **423.917m**，实际 **238 条动物记录**，本批 **24 只**；六类均在主路某处进入 CPU 十四米近邻。这是距离证据，不能证明镜头可见或无 GPU 遮挡。

三普通九区窗口共 **9 模型秒**，24 个新个体全部移动，23 个摄食；隆头鱼仅 4/5 摄食，否定结果保留。完整活区及磁盘冷恢复相等，旧 v4 死亡、库存、时钟及后续输出保持，原子保存失败不公开，损坏记录拒绝再生。四项原生生态检查通过，见 `output/validation/reef-fauna-seed52-native.json`。另一次独立生产入口首窗 1 秒：全部动物 130 移动、49 摄食，本批 12 移动、4 摄食；与九秒核验不累加。

三底栖资产六个唯一定向 CPU case 成功：初轮五项未变成功，加一次向外法线采样修正后的单项复验。初轮失败保留，生产几何哈希保持；核验包括实际全顶点动态范围、真实支持点、连续腹足、原生时钟只读和挂载后释放。浏览器/GPU 整体观感、遮挡和帧率尚未验收，云端检查与发布状态另记。

## 作者资料

- Museums Victoria / Fishes of Australia：[隆头鱼](https://fishesofaustralia.net.au/home/species/2962)、[蓝棘鼻鱼](https://fishesofaustralia.net.au/home/species/2201)、[花斑拟鳞鲀](https://fishesofaustralia.net.au/home/species/761)；[Australian Museum 隆头鱼](https://australian.museum/learn/animals/fishes/humphead-maori-wrasse-cheilinus-undulatus/)提供成年形态与较大个体外礁资料。
- [FAO 西中太平洋指南的 Calappa hepatica 账户](https://decapoda.nhm.org/pdfs/4113/4113.pdf) PDF第59页：8cm 背甲宽及浅沙贝砂生境；[冲绳美丽海水族馆物种记录](https://churaumi.okinawa/sp/fishbook/1459424511/)提供自然食螺及浅砂底资料。
- Australian Museum / Bill Rudman：[Dolabella auricularia](https://www.seaslugforum.net/factsheet/dolaauri)、[Phyllidia varicosa](https://www.seaslugforum.net/factsheet/phylvari)、[海绵食性说明](https://www.seaslugforum.net/find/3051)。
- FFESSM DORIS 作者资料：[楔海兔](https://doris.ffessm.fr/Especes/Dolabella-auricularia-Lievre-de-mer-a-oreille-2104)、[疣状叶海蛞蝓](https://doris.ffessm.fr/Especes/Phyllidia-varicosa-Phyllidie-verruqueuse-528)。用于核对后盘、双水口、伸缩步态，以及无颚无齿舌、裙下鳃和天然海绵食性；来源尺寸上限差异在目录中单独标明。

本批126个唯一定向case通过（新控制器8、三鱼资产8、三底栖资产6、完整原生生态4、显示和入口51、旧控制器及入口49）。底栖外表面法线fixture单项修正后仅复验该项，另外5个未变成功结果复用，初轮失败日志保留，不重复累加。一次生产构建9.46秒通过；4175独立预览已隐藏重启并确认监听。新提交170文件/计划1113项完整云端检查及Pages发布以实际运行状态为准。
