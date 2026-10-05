# 深海首版三类独立资产

日期：2026-10-03（Asia/Shanghai）。实现文件：`src/world/deepOrganisms.js`。当前仅为独立几何与动作模块，没有接入场景、UI、食物池或照明；在主场景接入后的真实截图与 GPU 性能仍待验证。

## 分类、尺度和形态边界

| 模板 ID | 保留的鉴定层级 | 几何度量与作者选择尺寸 | 已实现的可辨认结构 |
|---|---|---|---|
| `sea-pig-group` | `Scotoplanes spp.`，`genus-group`，属代理 | X 方向全体长约 1 单位；显示选择 0.08–0.16 m | 粉白、半透明、圆滑卵形软体；6 对粗细不等的长支柱管足；4 根长背乳突；10 个口触手及微小指状末端。 |
| `rattail-family` | `Macrouridae`，`family-group`，科代理 | X 方向全长 1 单位，长尾计入；显示选择 0.35–0.75 m | 灰褐大头、大眼、下位口和颏须；连续渐细鼠尾；分开的高第一背鳍、低长第二背鳍和长臀鳍，后两者至尾尖；双侧胸鳍和更靠前的腹鳍。没有独立扇形尾鳍。 |
| `pom-pom-anemone` | `Liponema brevicorne`，`species` | 展开 X/Z 最大横向直径 1 单位；显示选择 0.12–0.28 m | 低软体基部与密集、短、厚、渐圆钝的淡灰粉/淡紫触手形成膨松团簇；触手从主体各向伸出，不做长柄上单圈口冠。 |

尺寸区间是原型显示选择，不是从样方估计出的尺寸分布。模型的淡色外观供白色观察灯照明使用；材质自发光为零，模块不添加太阳焦散、灯锥、环境光或随相机改变的尺度。

`createDeepOrganism` 按上述三种科学名称/ID 准入。传入 `Peniagone`、其他类群、冲突学名，或把海猪/鼠尾鳕的 `identityLevel` 提升为 `species`，会明确抛错。`root.userData` 保留 `scientificName`、`identityLevel`、`morphologyProxy`、`sizeMeasure`、`displaySizeRangeM` 和来源链接。

## 本轮真实读取的一级来源

- [MBARI — Sea pig](https://www.mbari.org/animal/sea-pig/)：属条目支持透明软体、长管足撑离软泥、新鲜碎屑摄食，条目上限 17 cm、深度 1000–6000 m。其范围包含拟选 3500 m，但没有确认本场具体种或共现密度。
- [Museums Victoria — Scotoplanes globosa](https://collections.museumsvictoria.com.au/species/16875)：General Description 支持粉白/粉橙半透明卵形体、10 口触手与指状末端、约 5–7 对粗管足及背乳突。**本种资料用于有依据的代表形态制作，不把现有属代理改名为 S. globosa。**
- [LaDouceur 等（2021），Histologic Examination of a Sea Pig (Scotoplanes sp.)，DOI 10.3390/jmse9080848](https://doi.org/10.3390/jmse9080848)：本轮[原论文 PDF 镜像全文](https://pdfs.semanticscholar.org/4ff0/43f610848671582f65ce7b21c1f32aac004a.pdf)直接读取成功。Results（印刷 p.2）及 Figure 1 图注（p.3）明确 6 对管足、10 口触手、2 对长背乳突。**论文材料来自 1050 m，图注个体来自 1438 m，未命名型的已知范围是 985–1900 m；不能用它证明该具体型出现在 3500 m。** 本模板的固定数量是有来源的制作参考，不是全属诊断，不声称重建论文的具体个体。
- [MBARI — Rattail fish](https://www.mbari.org/animal/rattail-fish/)：科条目支持近底活动、大眼和颏须感知、鱼/无脊椎动物/腐肉食性；上限 1 m、汇总深度 200–4000 m。
- [FAO — Macrouridae，T. Iwamoto，p.977（PDF 第 1 页）](https://www.fao.org/4/y4161e/y4161e25.pdf)：直接读取科诊断，支持侧扁身体、渐尖长尾、大眼、通常前突吻与下位口、两背鳍及较长臀鳍、无独立尾鳍、靠前腹鳍和灰褐等颜色。此书面向 Area 31；**仅用作科形态依据，不把其西大西洋具名种的分布或鳍条数填入东北太平洋代理。** [FAO 世界鳕形目目录引言](https://www.fao.org/4/t0243e/T0243E02.pdf)也明确科内存在形态差异和少数例外，代表模板不覆盖全部成员。
- [MBARI — Pom-pom anemone](https://www.mbari.org/animal/pom-pom-anemone/)：具名条目支持膨松触手团、收缩/膨胀变化、粉白紫色、泥底与岩石露头，以及触手捕获流经的小型动物性食物；展开跨距上限 30 cm、100–4100 m。本文没有提供准确触手数或动画频率。

三个 MBARI 原页、Museums Victoria 原页及上述 FAO PDF 的文字均通过网页工具实际读取。MDPI 原站直接打开失败，使用标明 DOI 和作者的原论文 PDF 镜像核对。原论文 PDF 截图工具失败，Museum 图片链接虽解析到原图 URL，但未取得可检查像素；当前不声称已完成科学参考照片的多视角校对，也没有复制这些图片进项目。

海葵的 **136 根触手是渲染取样数**，不是已核实的本种诊断数量；`tentacleCountStatus` 明确为 `rendering-sample-not-diagnostic`。鱼鳍膜中的细条纹是材质细节，不赋予代理鱼某个具名种的鳍条数。没有描绘未经确认的海猪内部器官、发光器或本场真实物种密度。

## 接口和坐标

```js
import {
  createDeepOrganism,
  animateDeepOrganism,
  disposeDeepOrganism,
} from './world/deepOrganisms.js';

const group = createDeepOrganism(species);
group.scale.setScalar(agent.sizeM); // 米；几何始终保持单位尺寸
group.position.copy(worldPosition);
group.rotation.y = headingRotation; // +X 为前进/口端方向
animateDeepOrganism(group, simulation.timeSec, agent, environment);
disposeDeepOrganism(group);
```

工厂不自行挑选尺寸，动画不修改 root 的世界位置、朝向或缩放。需按主模型的 heading 约定设置 Three.js 旋转，不能假定二维 heading 与 `rotation.y` 的正号相同。

| 类型 | Root 原点 | `userData.feedingPointLocal` |
|---|---|---|
| 海猪 | 泥面支持平面；默认足末端 local Y=0，身体由足撑起 | `{x:0.472, y:0.045, z:0}`，口触手接泥区的近似采样点 |
| 鼠尾鳕 | 最下方支持基准，非身体中轴；身体中轴 local Y=0.19，颏须末端约 Y=0.006 | `{x:0.44, y:0.128, z:0}`，实际下位口附近 |
| 海葵 | 附底基部接触平面 local Y=0 | `{x:0, y:0.40, z:0}`，触手团内部的功能采样代表点，与模型捕获体积中心约定一致，不能当作全部捕获面的精确位置 |

转换采样点可用 `group.localToWorld(new THREE.Vector3(...))`。根节点按米缩放后，采样点不可再乘一次 `sizeM`。

海猪的足点顺序为前至后 `i=0..5`，每组先 `-Z` 再 `+Z`：

```js
x = 0.34 - i * 0.142;
z = side * (0.265 + Math.sin(i / 5 * Math.PI) * 0.066);
y = 0;
```

精确数组在 `group.userData.contactTemplateLocal`，每点格式 `[x,y,z]`。主模型可按相同顺序传 `agent.contactPointsLocal[12]`，点可为数组或 `{x,y,z}`；坐标须已转换成按单位几何归一的 root-local 坐标。动画将每根足末端的接触位置对齐该点，端点处的关节摆动权重为零。平地未传入时脚端保持 Y=0；真实起伏地形仍需主模型和渲染使用同一个 `deepFloorHeight` 采样。

## 动作与事件

`animateDeepOrganism(group, timeSec, stateOrAgent, environment)` 可接受状态字符串或代理对象，读取：

- `state`（字符串，或嵌套状态对象的 `name`）、`status` / `behavior`；`velocity` 的单位为 m/s，`sizeM` 为米，`activity` 可选且限于 0–1，`phase` 可选。
- `lastFeedAt`：模拟秒，初始 `null`。只有过去 0–5 秒内的非未来有限时间戳驱动明显口/触手摄食动作。状态仅写 `feeding` 而没有实际事件时，不凭空演出吞食。时间戳为 **0** 也有效。
- `contactPointsLocal`：海猪 12 足共同支持面；`contraction`：海葵 0–1 收缩量。字符串 `contracting/retracted` 可映射收缩，默认海葵展开并附底。
- `environment.currentMps`：数值（沿世界 +X）或 `{x,y,z}`，当前显示以水平分量缓慢弯曲乳突/触手；移除根节点旋转后使用局部方向，不由另一个时钟或 ROV 光控制。

海猪的足关节随活动轻微交替弯曲，脚端不被动画拔起；口触手在摄入事件后向口部收拢。鼠尾鳕尾部与背/臀鳍使用同一连续后向波，胸腹鳍轻微调整，摄食时口部只有很小变化。海葵触手随流轻缓偏折，最近一次实际摄入使有限一组触手收拢；不自行滚动、漂浮、产生猎物或更新 `lastFeedAt`。

频率、振幅、事件动作持续时间、颜色光学参数均为未校准显示参数，`animationParametersStatus` 明确保存该状态。模块不推导代谢、体能或捕食概率，也不主张鱼必然捕食同场海猪/海葵。

## 复杂度、资源和本轮执行验证

| 模板 | 可见 Mesh / 绘制次数 | 三角形 | 顶点 |
|---|---:|---:|---:|
| 海猪 | 3 | 4,336 | 2,797 |
| 鼠尾鳕 | 4 | 6,020 | 3,451 |
| 海葵 | 2 | 7,808 | 5,457 |

基准几何、纹理、材质用引用计数缓存；每个模型的动画几何是实例自有副本，不会修改其他个体。销毁一份会释放其动态缓冲，共享资源到最后一份销毁后才释放；重复销毁安全。动画由静态原位数组重算，避免累计形变。暂停后相同输入不重算；缓慢形变的照明法线约 8 Hz 更新，收缩变化与时钟倒退立即更新。闭合截面接缝在静态及动态法线中均平滑。

本轮实际执行 Node 烟测而非仅构建：

1. 三模板在 `timeSec=0, 0.25, 1.5, 10, 20, 1200` 及不同摄食/水流输入下，位置、法线、UV、颜色和动作标签均无非有限值，索引在合法范围。
2. 同一模拟时间/状态重复调用产生相同顶点；未来 `lastFeedAt` 不触发摄食；初始 `null` 不触发摄食。所有材质 `emissive=0`。
3. 12 足端点响应传入接触点，最大位移误差约 **1.43×10⁻⁸ 单位**。这验证模块局部端点适配，不替代起伏泥面接入后的世界坐标验收。
4. 两份海猪共享材质/贴图但拥有独立动画几何；销毁第一份只释放它的自有几何，共享材质/贴图仍保留；销毁最后一份各释放一次。
5. 不支持类群、冲突学名和更高鉴定层级按预期抛错；三角形/顶点/绘制数由真实实例统计。
6. 最终模块在本机 Node 暖运行的 **360 次更新 × 三个模型** 约 **504 ms**（每轮三体约 1.40 ms）。这是局部 CPU 烟测，不是浏览器 FPS、完整场景性能或跨机器承诺；最终需观察灯下近景和集成实测。

2026-10-03表面修整加入淡粉海猪软体变化、轻微透明度、灰褐鼠尾鳕鳞面斑驳和贴合眼眶，保留零自发光及原Mesh数。透明度和颜色仍是未校准视觉选择，不是测得的光谱或内部器官重建。[局部报告](../output/validation/deep-surface-smoke.json)与[世界接触报告](../output/validation/world-integration-smoke.json)通过；实际[鼠尾鳕近景](../output/validation/screenshots/deep-1790995488008-2026-10-03T02-44-48-052Z-498b9b46.png)已确认眼睛不再呈外置双球。深海整体仍是程序形态代理，未达到摄影级资产。
