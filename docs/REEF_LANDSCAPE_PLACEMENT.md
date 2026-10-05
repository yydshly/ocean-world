# Massive 景观珊瑚的刚体贴底检查

[07:45 实际广角图](../output/validation/screenshots/reef-1791013547635-2026-10-03T07-45-47-728Z-f9879b12.png) 中，部分 massive 景观珊瑚宽边悬在倾斜礁面上。单个中心射线加固定 `-.07 m` 偏移不能决定一个宽底轮廓的接触状态。本轮只新增 [reefLandscapePlacement.js](../src/world/reefLandscapePlacement.js)；未改地形、珊瑚源造型、材质或 World。World 的候选位置、缩放、随机数消费及接入由 root 负责。

公共函数为 `fitReefLandscapeBoulder(group, substrate, options)`。`group` 必须是未挂接的 `morphotype==='boulder'` 根节点，`substrate` 是实际礁体 Mesh。`options` 包含调用者选择的 `x`、`z`、统一 `scale` 与 `yaw`。默认 `burialM=.003`、世界米制底层带宽 `basalBandM=.005`、`maxHeightSpanRatio=.35`。

函数按所选刚体姿态读取真实 BufferGeometry 顶点，不改变输入根节点的位置、缩放、旋转或源顶点。所有 `minY+basalBandM` 内的唯一底层顶点参与实际硬底向下射线，最多 128 点；不会静默降采样。当前 low massive 模型去掉重复 UV 缝后是 72 点。没有额外几何、材质、纹理或模拟随机数的创建与所有权转移。

计算式是 `rootY = min(substrateY - basalVertexY) - burialM`。因此成功候选的最大底层间隙约为 `-3 mm`，其他边缘可埋得更深。这是有限顶点的刚体贴底显示规则，不是形变拟合。硬底高度跨度超过变换后总冠高的 35%、冠部完全埋没、足迹缺硬底或模型超出检查范围时，返回 `ok:false` 与明确 `reason`。

成功结果含 `rootPositionM`、`scale`、`yaw`、`basalVertexSamples`、`basalSamples`、`minBasalGapM`、`maxBasalGapM`、`hardSubstrateSpanM`、`crownHeightM` 和 `visibleCrownAboveHighestSubstrateM`。`crownHeightM` 是所选姿态中模型的总高度，35% 阈值以此计算；`visibleCrownAboveHighestSubstrateM` 单独给出拟合后冠顶超出已采样最高硬底的高度。失败也不改变对象。调用者在成功后应用返回姿态，在失败时用现有 `disposeOrganism` 释放克隆。

```js
const fit = fitReefLandscapeBoulder(coral, reefMesh, { x, z, scale, yaw });
if (fit.ok) {
  coral.scale.setScalar(fit.scale);
  coral.rotation.set(0, fit.yaw, 0);
  coral.position.fromArray(fit.rootPositionM);
  decorations.add(coral);
} else {
  disposeOrganism(coral);
}
```

[不可覆盖的实际网格报告](../output/validation/reef-landscape-basal-fit-v1.json) SHA-256 为 `f60ee5d103db29bf441c20dbf3459f690936e0f65208a84ad6688baadefa2329`。辅助函数源码 SHA-256 为 `8813b4ffc52b52a9d4c7a46f8364a6d1c0f3b2397ef050ae25fce757d09b3f49`。报告对 31 块实际硬底的 79,232 个三角形检查 32 个候选：16 个冠部候选（scale .9）接受，16 个较大外肩候选（scale 1.7）因底层足迹缺少硬底拒绝。接受样本的最大底层间隙为 −3 mm，最深底层埋入约 81.384 mm，冠顶超出已采样最高硬底至少 197.716 mm。

外肩拒绝案例中缺失射线后的未验证底部不在旧摆法间隙统计内。报告只对可验证的部分点给出对照，不能用它推断整幅图中全部悬空间隙。候选数量也不是后续 World 实际采用的数量。

`node --test tests/reef-landscape-placement.test.mjs` 的两项测试通过：真实 massive 模型在平硬底拟合，独立应用返回姿态后再次对实际底层顶点射线检查；主礁冠部接受；主礁 0 的完整可验证 `.55*sx` 外肩候选（scale 1.1）因过大硬底跨度拒绝；缺硬底、无效值及挂接根节点拒绝；函数调用前后的变换、顶点/索引等缓冲和资源键保持。调用者两次释放对象后，各资源只收到一次 dispose 事件。

只有底层顶点被检查，底部三角形内部和整个冠部仍可能与基底相交。有限采样不证明连续底面接触、附着生物学、物理稳定或真实在野共现。埋入阈值是作者设定的显示规则。没有当前 World 接入、浏览器画面、GLSL、GPU/堆内存泄漏或新长期运行通过声明；必须继续实际浏览器评价。
