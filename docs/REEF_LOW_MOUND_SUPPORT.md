# 低礁丘完整局部几何与重新贴底证明 v1

主任务的实际预览确认新低礁丘值得保留并验证。**纪录片视觉门槛仍未通过。** 本轮证据绑定共享地形和真实 Three 三角，排除正在变化的 World/材质/群体放置，不外推旧 frozen review-six。

## 明示的新契约

九主礁 indices 0–6、10、11 的冠部降至旧隆起的 55.03–64.79%，当前中心隆起 .808223–1.312578 m；宽过渡从 r=.08 开始，浅偏置凹部与外部低凸肩连接。旧 `.38` 高核心三角、珊瑚历史 rootY、扫描历史 rootY/max-gap 的精确保留契约经主任务明确授权终止，原比例与 XZ 保留。九岩 3,240 个旧核心样本下降超过 .20 m，6,480 个上表面样本平均绝对高度变化 .535647 m、最大 1.318915 m，不是小噪声修饰。

`REEF_ROCKS` 原数组位置/尺寸数值、footprint/inverse API、米制、seed/RNG 不变。与可导入的 [rounded-v1 精确基线](../output/validation/sources/reef-rounded-v1/src/habitat.js) 比较：31,248 个 XZ 点及 31,248 个下壳点精确相同；另外对实际几何逐面检查，**31 岩全部 39,616 个下壳三角位置与绕序精确相同**。7/8 支撑、9 桥盖与 19 辅助石的完整位置 buffer 仍有 22 份 SHA 相同。

## 三角误差与珊瑚根点

预览阶段 96,512 面对新曲冠采样不足，首个珊瑚根点实际间隙达 10.954 mm。九岩上半球改用 80 纬度，核心再局部用 160 纬度；下半球仍为原 40 纬度。当前 **31 岩共 113,792 面**，比上半球 80 的 102,272 面增加 11,520 面。高度场/XZ 函数不随采样改变。

31 个实际网格通过有限坐标、单位与 seam/pole 法线一致、正面积、焊接后每边两面、上/下壳绕序检查。264 个床脚真实射线仍埋入砂面超过 40 mm；九圈真实网格外缘处于砂面下 15–25 mm。桥盖实际中心 underside 仍为 y=.5 m。

2,112 个上表面射线的 **analyticY − triangleY 为 −4.662465 至 +13.005397 mm**，采用 ±40 mm 本轮界限；解析 forward/inverse 最大误差 1.136484 μm。有限样本范围不是连续任意坐标的误差上界。

48 个珊瑚根点（seeds 1、9、42、77、2026、reef-attachment）保持 XZ 与 size，Y 按当前 `habitatHeight + .004 m` 重算，下降 **.533907–.984510 m**。解析 4 mm 余量不变。当前明确采用 **2–10 mm 的实际支持带**，实测 **2.986300–5.549511 mm**，无样本穿入。旧 3 mm 下界是局部测试选择，不是物理定律；没有为 13.7 μm 阈值差继续膨胀网格，也没有声称旧 rootY 保留。

## 扫描按新硬底重新贴附

| 变体 | 显示顶点 | 当前 rootY / m | 旧 rootY / m | Y 变化 / m | 顶点间隙 / mm |
| --- | ---: | ---: | ---: | ---: | --- |
| 20k thumb | 22,909 | .5875360450090712 | 1.278520387877612 | −.6909843428685407 | 4.000000–282.981660 |
| 150k low | 115,927 | .5876888488749084 | 1.2788361136084079 | −.6911472647334995 | 4.000000–284.554816 |

两个来源 rootXZ 都为 [4.8, −4.8]，quaternion [0,0,0,1]、scale 1。150k low 每个显示顶点又独立对完整当前 31 岩下向射线，最小值为 **4.00000000000067 mm**。41 个 near-contact 顶点不能证明全表面接触或物理稳定；最大间隙包含骨架本体高度，不能描述成底部最大悬空。

原文件保持：20k thumb SHA `c3ce125d357952ff1caa68efb920fcd4876d29459517d83b2de2a3aa211f8060`；150k low SHA `11a2bedd6925eae830831e191eb4a13668eb93e6ba9c44270534f574ec89f12b`。未对 GLB 塑形或缩放。展示仍为干燥馆藏扫描，不计新增生态物种、食物或活态共现证据。

## 版本收据与检查结果

[不可覆盖 full report](../output/validation/reef-low-mound-support-v1.json) SHA `5dcaef22590196434aa08b65cb4f53259500da419fdf1e8704a6bfce94698c2d`；[局部检查记录](../output/validation/reef-low-mound-support-v1-local-validation.json) SHA `b7f8c1ac0450dff507b391a8cd6fd5381512f8f60f1e991e87b0f7b9fe114244`。源收据前后相同，最终核对仍对应当前文件。

当前 habitat SHA `8879c21b072aaae7a5bf63ad3bbb4f153a078850124a219c944f3ab7ed00ede1`；reefTerrain SHA `5eab04a04ccb1378bae0c3d5d507273995d79ebddcc37db3ffdadc372158a978`。旧预览 v1（terrain e8a680…）、rounded/asymmetric/fractured/weathered 报告、源基线及冻结构建未覆盖。

相关九文件主批次 19 项中 18 项通过，1 项旧 boulder `.9` 中心“应接受”fixture 失败：新曲冠在其平底下跨度 .121594 m，超过 crown .268053 m × .35 的原限制，这是正确拒绝。把可接受 fixture 改为 `.65` 小候选后，该文件两项均通过；原跨度限制、失败坡面与 transform/buffer/disposal 所有权检查保留。**19 个不同相关检查的最新结果均通过，未解决失败为 0**；主批失败记录保留，没有改写成单批全通过。

检查也覆盖当前真实地形 BVH 与普通射线的 1,000 个 nearest/obstruction 结果一致、变换/material sides/有限区间、动态几何排除、共享树 disposal、full scan 源几何不变。没有重跑无关长期 soak。

旧 asymmetric/rounded/weathered/fractured 测试文件已明确迁移到当前“九上核改变、完整下壳/XZ保留、根点/扫描重贴”的契约。asymmetric 兼容入口指向新 inspector；旧 rounded inspector/helper 留作历史实现，其旧不变断言不用于当前验收，旧报告 wx 目标不能覆盖。

## 实际画面与仍有的限制

已查看最终 5eab 地形的 [09:28:39 实际 panorama](../output/validation/screenshots/reef-1791019718892-2026-10-03T09-28-39-000Z-1d5557e4.png) 与对应 [metadata](../output/validation/telemetry/reef-1791019718892-metadata-2026-10-03T09-28-39-050Z-885aa86c.json)。CSS/canvas 1920×1080、DPR 1、ordinary seed42、暂停在 146 s；这是实际形体观察，不是 benchmark 或长时间稳定证据。

前景和中央肩体变低，边缘更自然地进入砂面，改形值得保留；冠部仍裸且偏圆，灰硬底面积大，枝状珊瑚简化、右侧人工两柱/椭圆盖仍明显。**纪录片视觉门槛仍未通过。** 主任务同期的 World 群体放置/纹理检查有独立版本，本报告只证明地形局部，不将其合并为旧历史性能通过结论。

这里不证明连续所有坐标无误差、鱼体全尺寸无穿模、完整扫描稳定或活态共现。当前相机/动物碰撞、World/LOD 生命周期、新群体候选放置与新生态实验由主任务整合。Node Draco 不覆盖真实浏览器 GLTFLoader、JPEG、Worker、WebGL 或当前源码的新 20 分钟性能。
