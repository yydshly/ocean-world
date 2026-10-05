# 岩棚预览与有限风险检查

本页保留 v1/v2 预览及发现入口回归时的证据；后续仅做的贯通修复见 [REEF_SHELF_PASSAGE_FIX](REEF_SHELF_PASSAGE_FIX.md)。

本轮只改变 authored rocks 7/8/9。raw REEF_ROCKS 参数、XZ、种子与 RNG 消费保持；9 个 low mounds 和 19 个辅助石的 28 份 position buffer 与 low-mound 基线逐字节相同。没有改 World、珊瑚、材质或冻结 dist。当前 v2 仍是待复核样片，视觉门槛未通过。

## 保留的版本

- 原 low-mound 稳定源码：[baseline](../output/validation/sources/reef-low-mound-v1/src/habitat.js)，habitat SHA 8879c21b072aaae7a5bf63ad3bbb4f153a078850124a219c944f3ab7ed00ede1。
- v1 完整依赖源码：[v1 snapshot](../output/validation/sources/reef-shelf-v1/src/habitat.js)，habitat SHA 0eaa4d820e98eede629d25779a71c97925c585bb073e2f1c8d238ddfbb591bf6。
- [v1 quick evidence](../output/validation/reef-shelf-preview-v1.json) 保留，不覆盖。其闭壳检查通过，但实际 [10:21:45 全景](../output/validation/screenshots/reef-1791022905237-2026-10-03T10-21-45-342Z-73e21f09.png) 暴露了方柱、梯形盖板和矩形门洞，不能据数值检查声称写实通过。

## 当前 v2

7 为宽右肩、8 为较低且偏后的窄支撑。三者足迹使用平滑偏置蚀岸轮廓，9 的上缘圆蚀并向右增厚；底部由窄凹蚀通道抬起，取代全片平底。正反面、renderer、共享 analytic 高度、footprint/inverse 均使用相同参数化。

[快速几何检查](../output/validation/reef-shelf-preview-v2.json) passed=true，SHA ad534511f02bdf13ac737915d83bd7e7c3415f31b06a4009f011d3f5bb24d9dc。31 岩体共 117,568 faces，7/8/9 各 4,992；finite、单位法线、闭合 welded edges、上下 winding 通过。432 个实际射线样本中 upper analytic−triangle 为 −1.926267..+5.508999 mm，lower 最大绝对差 4.347948 mm。中央 9 个 y=0.30 m 眼点，棚底间隙 148.388701..224.626955 mm；右/左支撑有限实际相交分别 14/12 格。这是有限相交，不是合并实体或结构稳定证明。

当前 habitat SHA aade41b01eb014edede8539beb3b4d1846a20090bca81107c743fa88fd8831ff；terrain SHA 5eab04a04ccb1378bae0c3d5d507273995d79ebddcc37db3ffdadc372158a978。完整 source before/after receipts 在报告内。

## 进一步检查发现通道回归

[局部动物与通道检查](../output/validation/reef-shelf-local-risk-v2.json) **passed=false**，SHA efc5bcdfd7bad3a3532ac128e8f274479d171931d6f21f3347275c03a85f6353。种子 42/77/2026 各 30 模拟秒、0.1 秒步长，root/nose/tail 对 7/8/9 实际面共命中 6,611 次，没有发现鱼点穿入；最小 root gap 129.665644 mm，水平头尾/中心的 body-bottom proxy 最小 100.072443 mm。非鱼 root 命中 0，不能据此证明任意静态附着安全。

新增 x=1.30/1.35/1.40、y=0.30、z=−3.20..−1.50 的 105 个直线通道点，有 11 点在 30 mm 净空 margin 内受挡，其中 6 点确实处于 cap 三角面实体内。例如 [1.35,0.30,−2.00] 落在实际垂直区间 [0.230550912,0.374712223] m。中央眼点开放不能推广为前后可进入；v2 下垂边唇阻塞原通道，这是形体回归，不能以增加几何分辨率修复。

v1 的 +30.338 mm upper 偏差是悬空方向；其最负 −6.900 mm 在旧坐标 [1.783436535,−0.131989665,−2.268968619] 的假设 analytic+4 mm root 上形成 −2.900218 mm 间隙。该点不是实际动物。v2 432 点的同类条件间隙为 2.073733..9.508999 mm，4 mm 是本模型选择，不是物理定律。

当前源码保持，未做完整历史合同迁移或长回归，等待样片方向和通道修复范围确定。点射线、水平头尾代理和有限中心路径不证明整个动物/相机扫掠体、动画俯仰或任意路径；没有新浏览器、GPU、生态长期稳定或科学校准结论。
