# 热带礁谷物种补充：有限一批

本批新增六个独立物种代表，重点补足可识别的动物轮廓与生活层。既有珊瑚鳟、彩绘龙虾的数据和模型保持原样；目录当前的 51 项是代表记录，不能据此认定完整海底生态已建成。

| 新物种 ID / 学名 | 独立形态与生活层 | 选定的已有食物池 |
| --- | --- | --- |
| `lionfish` / *Pterois volitans* | 礁缘水层；长背棘、辐射扇形胸鳍、红褐浅色条带 | `reefGuild.preyOrganicUnits`：未解析鱼类及甲壳类营养分量 |
| `chinese-trumpetfish` / *Aulostomus chinensis* | 礁缘水层；长管吻、细长体、后置背臀鳍 | `reefGuild.preyOrganicUnits`：未解析小鱼及甲壳类营养分量 |
| `moorish-idol` / *Zanclus cornutus* | 礁缘水层；薄圆盘体、黑白黄带、长背鳍丝 | `reefGuild.preyOrganicUnits`：未解析附着海绵等动物营养分量 |
| `sailfin-tang` / *Zebrasoma velifer* | 礁缘水层；高帆形背臀鳍、侧扁体、竖条带 | `resources.algae`：当地藻类有机分量 |
| `cushion-sea-star` / *Culcita novaeguineae* | 礁脚底栖；近五角鼓垫体、腹面五条步带与十个支撑足点 | `basicNetwork.coralOrganicUnits`：真实珊瑚附近的珊瑚有机分量 |
| `leopard-sea-cucumber` / *Bohadschia argus* | 礁旁软沙底；眼状斑、背弓腹平软体、管足与前部摄食触手 | `resources.detritus`：沉积物关联碎屑有机分量 |

四条食物池已有不同库存归属，不能把六种动物都视为同一种摄食者。它们只消费当地现有的选定代理；没有新建完整海绵、鱼类猎物或沉积微生物食物网，也没有捕杀具体可见动物。自然完整食谱、种群密度、运动和摄食速率仍未校准。

## 出生与历史边界

只有真实 v8 礁谷整组十二个 owner 均严格没有历史记录时，才使用 v2 出生策略。先保留旧 v1 两种居民的出生记录，再利用当时的自然余量加入新种；每 owner 礁谷居民总量最多四条，包含旧两种，仍接受完整身体、附肢、深度、支撑和实际栖息地检查。

每 owner 所有动物记录总容量仍为二十条，包含死亡记录和海龟；物理条件或余量不足时允许少生。已有历史组保持原记录，旧 seed 48 不补货；新批次用未访问的 seed 49 验证。新策略不会为观察镜头搬运动物、补死亡记录或修改旧地形。

## 当前证据

seed 49 原生首报：整组真实路径长 **425.615 米**，共有 **199 条动物记录**，其中本批六种共 **26 条**：狮子鱼 5、喇叭鱼 4、镰鱼 5、帆鳍刺尾鱼 4、枕海星 5、豹斑海参 3。起点最近狮子鱼距离约 **6.02 米**，其他新动物沿真实路径分布。

上述距离是 CPU 空间采样，不能等同于 GPU 画面可见、无遮挡或用户已看见全部物种。最终三普通九区窗口合计 9 模型秒，26 个新个体中 25 个有位移、25 个有摄食，六种均有两类行为。狮子鱼 4/5 移动、喇叭鱼 3/4 摄食，其余相应个体全部发生；不把未移动或未摄食个体改造成阳性结果。完整冷恢复与原地形、全部旧出生（含旧两种）一致。

本批已完成的有限检查：四鱼资产 **8/8**、两底栖资产 **6/6**、渲染接入 **42/42**。资产检查覆盖实际 Three 几何、完整运动包络、底栖足点、只读生态记录及释放；这些检查不代替视觉验收或野外校准。

## 已读原始来源

- Museums Victoria / Fishes of Australia：[狮子鱼](https://fishesofaustralia.net.au/home/species/2113)、[中华喇叭鱼](https://fishesofaustralia.net.au/home/species/1875)、[镰鱼](https://fishesofaustralia.net.au/Home/species/1891)、[帆鳍刺尾鱼](https://fishesofaustralia.net.au/home/species/2205)。形态、生活环境及食性用于物种区分；显示尺寸是单独选择。
- California Academy of Sciences：[Eschmeyer 鱼种目录 Zebrasoma](https://researcharchive.calacademy.org/research/ichthyology/catalog/fishcatget.asp?genus=Zebrasoma&tbl=species)。读取索引记录采用有效拼写 *Z. velifer*；Museums Victoria 生物资料页仍使用 *Z. veliferum*，未将目录打开失败称为阅读全文。
- Glynn 与 Krupp，1986：[枕海星摄食原始研究](https://doi.org/10.1016/0022-0981(86)90014-6)，读取论文索引摘要；Hawkins，2006：[UC Berkeley 作者研究](https://escholarship.org/uc/item/7b94s417)，读取作者 PDF 索引正文。支持珊瑚摄食与礁体邻近观察，未把实验摄食速率直接当作模拟校准。
- Purcell、Samyn、Conand，FAO，2012：[海参原作者种目录](https://www.fao.org/4/i1918e/i1918e.pdf)，读取 *B. argus* 第 28–29 页及沉积摄食术语。区分活体长度与加工干制长度，并按西中太平洋沙礁底资料选择代表环境。

本批以六种完整轮廓和真实生态接入收口。下一轮优先补齐整片礁谷的动物生活层、出现分布和生态关系，不继续围绕单个鳍、斑纹或相机微细调。

本机共 93 个唯一定向 case 通过，fresh 原生用修复后必要复验，原另三项成功 case 复用；重复检查不累加。一次构建 9.28 秒通过，独立 4175 预览已更新。本批完整云端回归与发布以新提交运行结果为准。原底栖执行位移容差除以 0.1 秒后超过速度门槛的问题，仅在 v2 执行端收紧；原 v1 完整 32 步输出冻结保持一致。底栖模型卸载后的空 Group 残留已修复并检查。
