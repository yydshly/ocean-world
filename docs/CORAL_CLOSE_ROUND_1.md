# 代表珊瑚近景 · 第1轮

目标：让一株分枝珊瑚完整可读，基部连接实际岩面，近景能看到较浅枝端及带凹口的侧杯。用户选择海洋纪录片式写实；本轮保留既有连续岩棚，不扩展生境。

活体形态参考：[Corals of the World 物种页](https://www.coralsoftheworld.org/species_factsheets/species_factsheet_summary/acropora-muricata/)、[原始图集](https://www.coralsoftheworld.org/species_factsheets/species_factsheet_images/acropora-muricata/)中的1052_C02_05与1052_C02_06，以及[JCU 鉴定笔记](https://researchonline.jcu.edu.au/15060/3/Wolstenholme_Scleractinian%20reef%20corals%20identification%20notes%202004.pdf)第36页。分枝应有不规则外张，径向杯呈朝枝端斜出的短管，末端有外突轴向杯和浅色组织。上述来源支持形态约束，不为当前模型的尺寸、密度或具体配色提供测量标定。

模型仍是装饰分枝形态近似，不是鉴定合格的A. muricata标本，不计入物种数、个体数或生态生物量。Smithsonian USNM229保持其死亡A. cytherea骨骼身份，未作为活体材质依据。

原始三个源码文件保存于`output/validation/sources/coral-close-round-1-before`。单株使用既有近景组织原型；原位相机被前景枝条遮挡。有限候选检查记录于`output/validation/reef-coral-rigid-placement-current-v1.json`，失败位置保留；包围盒相交不等于实三角穿透，清晰视线也不等于完整接触或无穿模。

资源修复只调整几何构造失败时的释放顺序。`coral-merge-cleanup-narrow-verification-v1.json`验证24个普通low/medium缓冲区与原版一致，并通过合并输出失败的单次释放检查。这些结果不是视觉验收或当前版本20分钟耐久证明。

最终姿态是既有rock6坡面上的刚性18°倾斜、0.85倍显示比例。`coral-close-round-1-placement-v3-verification.json`中28个基部均命中硬底，最大正间隙3mm、最深埋入45.938mm；其余123株姿态逐值不变，包围盒分离及5条实际冠顶视线通过。fixture未含扫描骨架、完整地板mesh或浏览器GPU；实际截图另行保存。

本轮两个形态尝试：v2仅增粗远端枝轴，实际同机位观察判为中性略差，已回退，源码与实拍保存在`coral-close-round-1-v2-rejected`及审阅页。v3维持原枝径与端点，仅给本株near原型增加短管状轴向颈、将侧杯覆盖延伸到远端；额外杯体由3993到4689，三角面由161328到188624，未新增draw。真实大小与密度仍未标定。`coral-close-round-1-surface-v3-verification.json`通过有限属性、独立杯壳闭合、凹口、父枝三角附着和构造失败释放检查；`coral-merge-cleanup-narrow-verification-v3.json`中24组普通low/medium属性与索引仍与基线完全一致。

同机位对比双方已采用同一新姿态，因此比较的是组织形态调整，不能借此证明迁移前后的同机位效果。两次尝试到此停止：实际v3枝端空白减少、侧杯覆盖有小幅改善，仍有粗钝光滑枝轴与铆钉状突起。下一步由用户判断：按1052_C02_06手工重做一段枝条，或按1052_C02_05校准整株枝径与疏密。

最终生产构建成功，bundle `index-Da1Z77tv.js`；4项Sites检查通过，未发布。视觉验收仍由用户判断，构建、有限基部取点和截图不构成完整浅礁样本通过；没有将旧20分钟耐久应用到当前版本。
