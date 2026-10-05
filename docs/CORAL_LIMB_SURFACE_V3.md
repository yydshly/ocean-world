# 枝状珊瑚 v3：小幅圆肩与连续外壁法线

日期：2026-10-03。最终快照：v3c。状态：**源码和 CPU 几何检查通过，改后真实近景尚未评审；主视觉目标没有因此通过。**

已实际查看 [05:33 近景原截图](../output/validation/screenshots/reef-1791005608622-2026-10-03T05-33-28-685Z-dca649f3.png)，其中枝表面有明显长平面光照和锐锥状末端。[配对元数据](../output/validation/telemetry/reef-1791005608622-metadata-2026-10-03T05-33-28-702Z-e3c92e1a.json) 的 selectedId 为 null，相机为 `[-2.072387254, 2.638263406, -3.273397858]`，target 为 `[-2.552002172, 2.022520476, -3.768503039]`。这张图用于判断已有显示缺陷；未凭未选择的近景为某一具体群体赋予物种身份。

## 改动范围与原因

应用仅改 [organisms.js](../src/world/organisms.js) 内的 `coralLimb`。动物 tube／fishLOD、radial cup、群体轴线和分叉 RNG、生态参数、材质／纹理、terrain、World、UI 与扫描加载器均未改。函数之外的全文 SHA-256 与 [改前记录](../output/validation/coral-limb-before-v3.json) 一致，值为 `3d47347a5aa7bf97419a4b5cb6b8fe51db08a261c37a8d7c6053eb460474845b`。改前完整源码另存于 [不可覆盖的快照](../output/validation/organisms-before-coral-limb-v3.mjs)。

检查显示 UV seam 已共享法线，不是需要重新修复的接缝问题。旧枝外壁只有 3／4／5 个轴向 shaft 环，长三角的面积加权法线会传递粗轴向采样造成的平面光照；末端又从较宽 endRadius 一段直线缩到毫米级 axial lip，产生锐锥外形。

本次做两项小改：

1. 在 **medium／high 且 endRadius ≥ 6.5 mm** 的 axial 枝，加入一枚位于末端过渡 62% 处的圆肩环。半径为原线性过渡与圆顶截面按 20%／80% 混合，减少单直锥肩；不是完整高密度重建。Low 不加环，原低 LOD 面数不变。该阈值、剖面与采样位置都是显示选择，不是物种实测常数。
2. Shaft 与新肩环法线改用同一 authored centreline、半径、角向 relief 和局部 transported frame 的有限差分叉积，随后合并重复 seam 法线。局部角采样步长 0.001 rad，轴向采样取 `min(0.0001, 0.00002 / length)`；double 叉积长度平方的退化阈值为 1e−30。每个候选必须朝向全部相邻的**实际外壁三角面**，否则保留原几何法线。这避免极短融合枝的连续设计表面在粗网格间局部折叠时引入反向光照。外壁法线对应连续设计表面，**不声称与每一个粗网格三角面的平面法线完全相同**。

插入新环不会推进旧环的 frame 历史。因此所有原 position／UV／color 顶点，包括 basal feet、axial lip、内口与 mouth pole，逐值保持。杯凹口仍用生成几何的法线；内口环／pole 和所有 radial cup 的旧法线逐值保持。共享 lip 可随新增外肩相邻面自动改变几何法线，不额外覆盖为 outward shaft normal。

自然史方向沿用已核实的 [Corals of the World A. muricata 事实页](https://www.coralsoftheworld.org/species_factsheets/species_factsheet_summary/acropora-muricata/) 与项目 [科学边界](SCIENCE.md)：具名活体仍为 A. muricata，景观形态没有新增物种身份。原毫米级杯外径和凹深保留为 authored display detail；它们不是标本孔隙、珊瑚虫数量或生长速率测量。本次未复制干燥 A. cytherea 扫描到具名活体。

## 几何、方向与预算证据

[主检查报告 v3c](../output/validation/coral-limb-surface-inspection-v3c.json) SHA-256：`ae9d58ca76090a0347dd9233639f50021b52fe6c82e2b46f4739ed49a8280bed`，由 [检查脚本](../scripts/inspect-coral-limb-surface-v3.mjs) 生成；当前 organisms source SHA-256 为 `92e8606b4896f723cc40a518f4e2f8aafb844d51d7c409396f2b9085a86538a5`。输入前后 hash 一致，执行了 [三项几何回归测试](../tests/coral-limb-surface.test.mjs)，3／3 通过。复核命令为 `node scripts/inspect-coral-limb-surface-v3.mjs v3c`；默认 v3 输出仍受拒绝覆盖保护。

覆盖 4 个具名变体，以及 boulder／table／branching × 4 变体 × 3 detail，共 **40 变体**。所有原顶点的 position／UV／color 和群体 branch／corallite 汇总数据保持；低 LOD 的完整 position buffers 也逐字节相同。最大包围盒端点变化为 **0.0014140606 m**；没有修改轴线、分叉或生态位置。

| 具名变体 | 改前面数 | 当前面数 | 新肩环 |
| --- | ---: | ---: | ---: |
| 0 | 33,184 | 35,044 | 93 |
| 1 | 28,080 | 30,160 | 104 |
| 2 | 28,760 | 30,980 | 111 |
| 3 | 28,000 | 30,200 | 110 |

全部具名变体 <36,500 面；Low branching 保持 5,940 面、table 保持 5,976 面，所有 Low <6,000 面。每群体仍 1 mesh、1 material、2 texture，估算主 draw 为 1；没有新增 draw、材质或贴图资源。Boulder 的全部属性未改。

实际从生成顶点／法线测得：

- 所有属性有限、索引不越界、法线长度在 0.99–1.01 内；枝壳焊接 1 μm 后 0 boundary edges、0 non-manifold edges，三角 double-area >1e−9 m²。
- 外壁法线与实际环径向的最小 dot 为 **0.34708537**，朝向外部；内口法线的最大径向 dot 为 **−0.57083683**，仍朝向凹口内侧。
- 重复 UV seam 的法线差为 0；旧杯 lip／mouth 几何和内口法线保持。真实杯凹深继续在 0.6–3.5 mm 检查范围内，与旧尺寸逐值保持。

另做 [实际三角面／平均顶点法线方向检查 v3c](../output/validation/coral-limb-face-normal-orientation-v3c.json)，SHA-256：`3441f1c10a41a0e52bc3939c93cf572f413bad999431e0a65a1449e7ac5a4521`。40 变体所有索引面均执行叉积方向比较，**0 面出现负 dot**，最小 dot 0.16071240。这约束新法线没有与实际面方向整体相反，不证明每个角度的最终像素光照自然。

## CPU 准备成本与剩余验收

[小样本 CPU 准备报告 v3c](../output/validation/coral-limb-preparation-cpu-v3c.json)，SHA-256：`13a02f30c15fc208ad43d64f514873575e1365a92766ca830c2ba8d0da0a62de`。每批真实构造 4 个 named＋4 个 Low branching＋4 个 Low table，共 12 群体；完整 dispose 后重新构造，前后顺序交替，3 组观测包含纹理生成、JIT 和 GC。改前平均约 **591.4 ms**，当前约 **748.4 ms**，增加约 **157 ms／12 群体（26.5%）**。每组均有增加，需在真实初始化体验中复核；新增工作只在生成静态共享几何时执行，不进入动画帧。本结果不是完整 World 初始化、GPU prewarm、浏览器 FPS 或正式稳定性结论。

历史 [v3 主报告](../output/validation/coral-limb-surface-inspection-v3.json)、[v3 方向报告](../output/validation/coral-limb-face-normal-orientation-v3.json) 和 [v3 CPU 报告](../output/validation/coral-limb-preparation-cpu-v3.json) 保持原文件。v3 的 1e−20 退化阈值会让部分毫米短枝回退旧法线；降低阈值的中间 v3b（源码 SHA `cafdd148164a9907a0b20679607065c2c3de33651df9f5f74b173b20acc08339`）暴露 table/0/medium 的 1 个反向平均法线面，方向／外向检查失败，未输出通过报告。[v3b CPU 原记录](../output/validation/coral-limb-preparation-cpu-v3b.json) 仍保留，但不属于当前通过快照。v3c 增加真实相邻外壁方向检查后重新通过，**没有放宽外向、内口或面方向测试**。

Low 的实际轮廓仍采用原采样，本次主要改善它的外壁光照；近景轮廓是否继续呈现锥尖，需要真实固定镜位判断。圆肩也没有合并相交枝条为 biological union、添加活体组织微观几何或增加毫米级 radial cup 密度。最终自然感仍可能受稀疏几何、材质细节、光照与礁石背景影响。

Root 后续使用同镜位、相同画布尺寸和环境做真实前后 macro，再决定是否需要额外局部采样。**现有截图与冻结性能报告不因这次 CPU 检查而变成改后的视觉／性能证明。**
