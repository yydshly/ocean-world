# 底栖动物与沙床活动反馈

2026-10-09 本地有限批。用户确认4175入口已打开；按用户要求继续本地验证，积累阶段再提交。

这轮把已有豹斑海参（Bohadschia argus）、馒头蟹（Calappa hepatica）、豹纹鲆（Bothus mancus）、低平海饼（Clypeaster humilis）接入动物扬沙层。原有蓝斑魟、羊鱼、寄居蟹和黑海参仍使用原参数；浅海目录仍89个代表条目，没有新增出生配方。不同底栖活动用不同的低矮、小范围扰动表达，让实际动物活动与床面联系起来。

| 已有动物 | 联动条件 | 所选反馈范围 |
| --- | --- | --- |
| 豹斑海参 | 真实软沙床慢爬、当地碎屑摄食 | 近床少量沙粒，上限8厘米 |
| 馒头蟹 | 真实软沙床步行、当地有机猎物摄食 | 身边短促扰动，上限12厘米 |
| 豹纹鲆 | 真实贴底位移、当地有机猎物摄食 | 较宽的小片扰动，上限18厘米 |
| 低平海饼 | 真实软沙床慢移、当地碎屑摄食 | 很低且轻的扰动，上限6厘米 |

这些高度、数量、粒子尺寸和回落速度是有界显示选择，未按野外物种测量校准。爬行要累计实际位移，摄食要有当前所属owner和正确食物池的真实扣账记录。加载、首次读取、暂停、时间跳跃、位置瞬移、离地和硬底不触发新事件；重新打开不会重播已保存摄食。新粒子沿流偏移时仍检查实际软沙与固体支撑面，触及床面、礁石或物件就结束。

全层继续最多256粒子、180条标量来源、每帧32个发射请求，只有1套geometry/material和最多1次draw call，不保留动物对象，不加库存或存档字段。原四类独立输入的完整120帧对照（统计、粒子位置及buffer）一致；新旧混合时共享同一预算，不保证每个旧粒子的序列仍一致。

生物依据与边界：

- [Calappa hepatica原始采集和习性观察](https://decapoda.nhm.org/pdfs/29866/29866.pdf)记录礁浅水沙地及用足推沙埋身；本轮仅表达床面扰动，没有实现真实埋沙和沙体变形。
- [Australian Museum的Bothus mancus档案](https://australian.museum/learn/animals/fishes/flowery-flounder-bothus-mancus/)说明浅水沙底生境；本轮没有新增伪装或潜沙过程。
- [Purcell等海参生态作用综述及作者观察](https://www.researchgate.net/profile/Steven_Purcell/publication/311234596_Ecological_Roles_of_Exploited_Sea_Cucumbers/links/588fd2aa92851c9794c4a309/Ecological-Roles-of-Exploited-Sea-Cucumbers.pdf)包含Bohadschia argus沙质礁湖观察，并讨论表层移动与沉积摄食的扰动；这是生态背景，不是扬沙数值校准。
- [Mancosu与Nebelsick原始生态形态研究](https://www.app.pan.pl/archive/published/app62/app003572017.pdf)及[Qatar e-Nature海饼档案](https://www.enature.qa/specie/clypeaster-humilis/)支持浅层沉积物与有机颗粒摄食参考。当前没有真实颗粒输送、浅埋或沙床重塑。

本地入口仍为[礁谷动物生活层](http://127.0.0.1:4175/ocean-world/?demo=reef-valley-region&seed=55&world=reef-mobile-benthos)，刷新读取本地新构建，沿原路径观察。动物不保证集中在入口，不强制全种同框。显示沙粒不代表食物、沉积物质量或真实流体模拟；CPU与Three验证不等于GPU画面、遮挡或帧率已验收。

本地验证：14个唯一定向case通过（新增6、原有8），六个普通九区窗口各3模型秒，共18模型秒。固定55原427.639米路线自然已有四类1/3/1/6，共11只；其中10只在本次沿路窗口中产生反馈，四类均覆盖，不把11只全部称为已触发。整个显示层累计发射70→105粒子，这是18秒累计次数，不是同时密度或沉积物质量；入口0米窗口没有新来源。完整180帧生态active记录在读取既有渲染时钟后逐次精确一致，食物与有机账、冷恢复active/disk及首次不重播通过。每区20条全部记录、9活区/25公开支撑/97私有预读保持。

首轮和一次诊断复验误把渲染getter补写时钟算作显示层修改，失败日志保留；确认首帧96个原非居民的timeSec曝光后，改为先取得完整实际渲染输入，再比较显示前后全部生态记录。没有修改生产时钟或放宽生态门槛。最终使用ReefWorld实际habitatY查询，有限原生probe成功。原四类完整120帧独立显示对照精确一致。

最终生产构建6.52秒通过并准备dist。本轮242运行源码仅OceanAnimalSediment改变，原241个及生境/出生/生态控制器保持；新增测试接入205文件本地工作流，未运行整套云端检查。验收保存在忽略目录output/validation/resident-sediment-delivery.json及resident-sediment-native.json。未暂存、未提交、未推送、未部署；GPU整体观感仍待实际验收。本批收口，后续优先成片动物群落和跨生境生活关系，不继续单个粒子/材质/镜头细调。独立Goal保持暂停。
