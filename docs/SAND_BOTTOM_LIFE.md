# 沙床动物生活层：本地有限批（2026-10-09）

新增三种轮廓与食性不同的真实个体代表，包含模型、实际随机出生、活动、原生扣账、保存、重载和观察档案。浅海目录98→101，数量不等于完整天然物种群或食物网。

| 代表 | 本版尺寸与活动 | 营养分量 | 56号海区出生 / 移动 / 摄食 |
| --- | --- | --- | --- |
| 斑点豹鲆 Bothus pantherinus | 18–26cm全长；左眼侧向上、体缘长鳍和圆尾，软底短移 | 原当地reefGuild.preyOrganicUnits | 6 / 2 / 6 |
| 梳棘沙海星 Astropecten polyacanthus | 6–10cm整体最大腕展；五尖臂及梳棘，沙粉砂慢移 | 原当地reefGuild.preyOrganicUnits | 6 / 5 / 6 |
| 糙海参 Holothuria scabra | 18–26cm体长；隆背扁腹、皱褶、短乳突和20口触手，贴底慢移 | 原当地detritus中的有机分量 | 5 / 5 / 5 |

物种和软底生境依据分别为[Museums Victoria](https://fishesofaustralia.net.au/home/species/4687)、[FAO鲆科物种账户pp3818–3819](https://www.fao.org/4/y0870e/y0870e45.pdf)、[Australian Museum](https://australian.museum/learn/animals/sea-stars/sydney-seastars/astropecten-polyacanthus-mller-troschel-1842/)、[FAO海参目录pp80–81](https://www.fao.org/4/i1918e/i1918e.pdf)和[NParks](https://www.nparks.gov.sg/florafaunaweb/fauna/4/1/416)。沙海星动物性分量参考[NIWA食物链综述](https://webstatic.niwa.co.nz/library/ARCtr2009-108.pdf)，不外推完整天然食谱。[2010原始分子研究](https://repository.si.edu/items/461af10f-ff51-4cbc-a586-81dfce8c532d)提示A.polyacanthus为种复合群，本版采用博物馆命名形态代表；不把不同区域成员视为同一种实测群落。鲆鱼与已有Bothus mancus分别保存，糙海参不合并H.lessoni。

显示尺寸、3–15m入场深度、数量、速度与任意光照下的有限活动均为实现选择，没有野外校准，也不声称已模拟严格天然昼夜日程。三种只表现露出沙面的身体，未实现埋沙、离底游泳、砂粒处理、捕杀可见动物、繁殖或完整天然食谱。沙不是能量库存。原六类底栖动物的已有代理范围和输出保持。

新benthic v3把九类候选随机排序，共用原四个名额与owner内20条全部动物记录额度；死亡和海龟仍占名额。整身保守半径、实际床面/底质/冠层、植物与其他动物占位、出生/活动范围、坡度与水面净空检查保持。空生境和空营养库存保持空；没有为展示而强制出生或补食。记录lastSandIntake的owner、模型时间、所扣库存、前后量、摄入量和当时位置；校验拒绝混版、伪造摄入或错误姿态。几何与支持检查是有限CPU采样，不是所有顶点连续接触面的证明。

固定56草甸沿原394.323m路线，在0/140/280m三个普通九区窗口分别模拟4秒（日间10时/10时/夜间2时）。十二owner原生人口仍198，当地代表类型25→28。4条鲆鱼和1只海星在这些窗口没有超过1mm移动，保留否定结果；不能把全部17出生记录称为全部持续活动或GPU可见。所有三类有成功摄食，完整账本平衡。新重载active/disk及同环境未来3步精确；实际旧v2死亡、时钟、食物和未来保持。旧v1/v2固定32步及六旧模型32帧1,557,442字节与修改前冻结文件精确。

新[草甸预览](http://127.0.0.1:4175/ocean-world/?demo=seagrass-meadow-region&seed=56&world=sand-bottom-life)使用同地形和随机键、独立动物历史。环境、探索和发现仍共享原种子；原显式alias及旧存档不迁移、不补充、不清除。正常新owner和导演启用最新版，旧预览有“最新海域”按钮。沙地生物观察助手已接受真实v2/v3个体，修复原先individual只接受v1的遗漏；原67章导演/61动作保持。选中档案明确区分最近成功摄食与尚无摄食记录，并显示沙海星整体腕展。

57个唯一定向case通过：新8、原生2、原控制32、目录/资产15。初版混合换行断言在写入前停止；两个单位fixture/API错误、一个旧目录数量断言失败，日志保留且只复验失败；目录最初两份文件零匹配包装没有计为测试成功，随后明确补跑。没有累加重复或失败。225个工作流测试文件未云端全跑。

生产构建和prepare成功，Vite4.18秒、含prepare4.936秒。255运行源码中245旧文件精确、8旧文件修改、2新增；最终构建前后hash精确。4175仍是原preview进程PID48560，未提交或发布。完整收据、源码hash、唯一case及失败日志在忽略目录output/validation/sand-life-delivery.json及同前缀文件。

CPU/Three几何和原生生态检查不构成当前GPU画面、遮挡、帧率或纪录片写实验收。本批收口，继续整片动物群落与生境覆盖；不延长单体鳍、棘、材质或镜头微调。
