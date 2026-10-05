# 岩棚入口回归修复（限定范围）

当前生产 habitat SHA 为 1b70e6111299511fa4a6b0e564f97029b86c135fb1c4442868f449a41d5eb7d7。terrain 仍为 5eab04a04ccb1378bae0c3d5d507273995d79ebddcc37db3ffdadc372158a978。本轮只修复 v2 中央凹窝无法从前后贯通的问题，完成后源码保持；没有开始 v3 美术或完整旧合同迁移。写实视觉门槛仍未通过。

## 修改与保留

v2 原源码按原字节保存在 [snapshot](../output/validation/sources/reef-shelf-v2/src/habitat.js)，其失败的 [risk-v2](../output/validation/reef-shelf-local-risk-v2.json) 保留。窄凹蚀通道沿 z 贯通；横向 mask 在 |normalized world X|≤0.13 完全生效、到0.28以 C2 过渡消失。需要退让的棚底抬至0.355m；原上唇过低处，上下共同抬起，边界 cap=0 时仍合于同一点，避免虚构净空或倒壳。

相对 v2：岩7/8与另外28块的30份 position buffer 全部 exact；岩9全部 XZ 顶点 exact，footprint API 未变。岩9有95个上半部和171个下半部顶点改变，上半部最大抬升301.811945mm、下半部280.075230mm。上面变化位于 normalized world X [−0.271763772,0.249477804]、Z [−3.007179976,−1.932408571]m，集中于原低前后唇；不能称整个上表面保持不变。

第一次 correction 的 [quick](../output/validation/reef-shelf-passage-correction-v1.json) 与 [risk](../output/validation/reef-shelf-passage-risk-v1.json) 保留，源已另存 [snapshot](../output/validation/sources/reef-shelf-passage-correction-v1/src/habitat.js)。指定105点当时已开放，但额外横向30mm余量的两条实际射线碰到三角形唇部，因此把窄 mask 的完全生效半宽由0.08扩至0.13。其余形体没有新迭代。

## 当前有限验证

- [correction-v2 quick](../output/validation/reef-shelf-passage-correction-v2.json) passed=true，SHA a0858813efa1a0ef5ce3b3881fd81ad333dc5454e18e62255630a96ac3dc76b8。31岩体仍117,568 faces；finite、单位法线、closed welded edges、上下 winding 与有限支撑交叠通过。432 actual rays 的 upper analytic−triangle 为 −1.926267..+10.400826mm，lower最大绝对差20.487878mm。误差是已量到的三角近似，不能叫精确贴底。
- [passage-risk-v2](../output/validation/reef-shelf-passage-risk-v2.json) passed=true，SHA 2a812b6ce4467b1e8681dce795cd4e8446898e927ac14a590e32b5ec59bf6d5b。3 seeds [42,77,2026]各30模拟秒，root/nose/tail实际命中6,611次，0点穿入。最小 fish root gap129.665644mm、body-bottom proxy gap100.072443mm；非鱼root命中0，没有静态附着覆盖。30条前后1.7m actual rays（x=1.27/1.30/1.35/1.40/1.43，y=.27/.30/.33）全部0 hit。
- [independent clearance](../output/validation/reef-shelf-passage-clearance-v1.json) passed=true，SHA 7c29799b8f1d16af5e8737b603ec42bcb4d5f6e771ad496272bcd96d174f2a7c。105个指定点 x=1.30/1.35/1.40、y=.30、z=−3.20..−1.50，独立遍历全部31 analytic footprints与全部31实际三角面，不以实际命中作为 analytic 检查前提。66个 actual intervals与66个 analytic intervals都在30mm margin之外；最小 actual gap54.999989mm、analytic gap55.000000mm、共享床面gap482.949664mm。

原中央9眼点的实际间隙148.388701..224.626955mm保持。有限 root、水平半长度头尾代理、床面及前后射线不证明整个动物/相机扫掠体、动画俯仰或所有路径。没有新长期生态实验、扫描全顶点重跑、物理稳定或20分钟浏览器性能结论；旧报告继续只覆盖其记录版本。所有新报告都有 before/after源码收据，旧失败报告与基线未覆盖。
