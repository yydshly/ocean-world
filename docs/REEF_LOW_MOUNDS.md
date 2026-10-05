# 九个主礁降高与宽冠部改形：预览阶段 v1

08:37 实际画面确认旧高核心与低外肩之间仍形成大面积裸圆柱墙后，主任务授权九个主礁 indices 0–6、10、11 调整核心高度和轮廓。旧 `.38` 核心、旧珊瑚 rootY、旧扫描 rootY 的精确保留契约在这一版明确终止；比例、XZ、种子、原扫描 geometry、7/8/9 桥体与 19 辅助石的形状仍保留。

## 当前改动

核心相对共享砂面的隆起按岩体降至旧版的 **55.03–64.79%**，九块实际中心冠部 rise 为 **0.808–1.313 m**，旧值为 **1.280–2.042 m**。偏置浅凹部改变宽冠部的曲面；高核心向低外肩的 C2 过渡从 canonical r=.08 开始，结束半径随角度变化，不再把 .38 内的高体块保持成硬台面。外肩三个低凸肩、两宽沟及 .90→1 的 15–25 mm 入砂接边沿用上一版。

`REEF_ROCKS` 原数组位置和尺寸数值未改，没有额外 RNG 消费。九块上表面所有采样点从当前共享 surfacePoint 求值，模型 surfaceY/habitatHeight 也使用新高度场。下壳、原 footprint/XZ/逆坐标、7/8/9 与辅助石保持上一版。珊瑚与扫描需在新硬底重新贴附；这里没有声称旧姿态保留。

## 快速检查和基线

[新不可覆盖 quick report](../output/validation/reef-low-mounds-preview-v1.json) 与 [quick test](../tests/reef-low-mounds.test.mjs)。仅执行有限、闭合与采用高度检查，未先重跑旧 full proof。

- 31 个实际 Three 网格：有限坐标、单位法线、焊接后每边两面、正面积、上/下壳绕序通过，共 96,512 面。
- 2,976 个 XZ 样本、2,976 个下壳样本与上一版精确相同。r=1 下壳显式使用负分支，避免 JavaScript `-0` 被归入已改写的上分支。
- 22 个未改岩体的整个位置 buffer 与上一版 SHA 相同；九大岩的上表面 buffer 均已改变。
- 九块实际中心射线高度与解析冠部相符，核心相对 floor 的降高比例处于授权的 .55–.65。
- 本轮 quick test 1 项通过，约 .903 s；不代表 full scan/coral/camera 或视觉门槛通过。

上一轮稳定的 [habitat 字节](../output/validation/sources/reef-rounded-v1/src/habitat.js)、[reefScenery 依赖](../output/validation/sources/reef-rounded-v1/src/reefScenery.js) 与 [terrain 字节](../output/validation/sources/reef-rounded-v1/src/world/reefTerrain.js) 用 wx 完整保留为可导入目录树。其 SHA 分别为 `bbad15ee12a57c2349146a4f6b2e5bda879582cda982c680d50907f2668b4bbb`、`28189c2586c2bd47fb99eee74f23565cf210540637b5f050ab7cd10fb136824d`、`f256a0b70493f12ad50dd07a671702e7c086559eed4c8913054321c81414c912`。旧报告、原扫描文件与冻结 dist 未改。

## 预览阶段与后续完整证明

此页记录 96,512 面的早期预览 quick receipt。主任务实际预览确认形体值得保留，随后已完成[新局部完整证明](REEF_LOW_MOUND_SUPPORT.md)：当前曲冠局部加密至 113,792 面、48 根点重贴、扫描 115,927 顶点 ≥4 mm，并明确记录新 rootY。旧核心三角/历史 rootY 不变断言已在当前测试中替换为授权的新版本契约，旧报告未覆盖。纪录片视觉门槛仍未通过；相机、动物碰撞、World 生命周期与新生态实验仍由主任务整合。
