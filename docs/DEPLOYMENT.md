# GitHub 与网页部署

更新：2026-10-06。

完整生活带版源码 `01d902df2de6b23e3a8804b9805a98bd763bf66d` 已发布。[运行37418001983](https://github.com/yydshly/ocean-world/actions/runs/37418001983) 构建、119项当前整合检查（0失败）及Pages部署全部success；部署 `6876352206` 状态success。打开[线上导演](https://yydshly.github.io/ocean-world/?demo=director)，章节列表新增“生活带：礁群沙道”和“生活带：草床水层”，共36章、1×观察时间422秒，加载另计。适宜且四区未访问时，新组合中的礁丘/草床与实际动物和库存一起保存；旧区域不重建。本机同样119项及一次构建通过，不与云端重复相加；[交付记录](../output/validation/living-belt-delivery.json)只包含CPU模型/Three几何证据，浏览器工具受阻，本轮无实际整景播放或视觉验收。此前发布历史如下。

导演整体进度/完整播放记录版源码 `84b8bba974781468fcff8f2c4bcd58406791ba0a` 已发布。[运行37416425198](https://github.com/yydshly/ocean-world/actions/runs/37416425198) 构建、101项当前工作流检查（0失败）及Pages部署全部success，部署 `6876104761` 状态success。打开[线上导演](https://yydshly.github.io/ocean-world/?demo=director)，可查看路线位置、剩余估时及本次完整播放章数；跳章/提前结束不等于全部看完。本机构建及82项有限相关检查通过，101项包含82项不相加；仍无新版浏览器整段观看/截图验收。此次导演整体导览包收尾，此前发布历史如下。

导演重试/发现旅行/键盘操作的有限修正版源码 `fbde7089123148ad93e88145d254833180ece1f1` 已发布。[运行37415436017](https://github.com/yydshly/ocean-world/actions/runs/37415436017) 的构建、89项当前工作流检查（0失败）及Pages部署全部success；部署 `6875952422` 状态success。使用[线上导演](https://yydshly.github.io/ocean-world/?demo=director)，本机构建及70项相关检查通过。89项包含本机70项，不相加。浏览器整段播放未新增实测，此前实际发布历史如下。

巡游速度版源码 `3deced6c1816396603b4dfeb8f01ddda825e4095` 已提交并发布。[运行37403459202](https://github.com/yydshly/ocean-world/actions/runs/37403459202) 的生产构建、77项当前工作流检查（0失败）及Pages部署全部success；部署 `6874045206` 状态success。打开[线上导演](https://yydshly.github.io/ocean-world/?demo=director)，播放器右上角“巡游速度”可选0.5×–4×。本机生产构建及58项有限相关检查通过；[本机导演](http://127.0.0.1:4173/ocean-world/?demo=director)也已更新。本轮浏览器工具拒绝本机URL绑定，没有新增实际播放/截图核对；部署成功不替代实际浏览器验收。

此前移动镜头源码 `7de5b4bb698023f94c7703c54c68820ec597d41b` 本机构建/68项检查通过，但 [发布运行 37366892941](https://github.com/yydshly/ocean-world/actions/runs/37366892941) 已于10月5日20:14 UTC结束failure：build cancelled，runner_id=0、无执行步骤，deploy skipped。此运行未发布成功，不再称queued。[GitHub 官方状态](https://www.githubstatus.com/)记录Actions故障于10月5日22:49 UTC解除；本轮正常重新构建并发布，未更换托管方。

最新自动演示：[导演入口](https://yydshly.github.io/ocean-world/?demo=director)。修复源码 `e59c59a73b14f3f85cd4d5f466cb8a061ba7174e` 的 [运行 37359031147](https://github.com/yydshly/ocean-world/actions/runs/37359031147) 构建、54 项相关检查和部署成功；部署 `6867326583` 状态 success。此前导演源码 `3f92b0a46f72e565163818f2f656b90afc7c6d5b` 的 [运行 37356921260](https://github.com/yydshly/ocean-world/actions/runs/37356921260) 构建、49 项检查及部署成功，但实际导览随后暴露旧捕食事件显示缺陷。首次修复的 [运行 37358590602](https://github.com/yydshly/ocean-world/actions/runs/37358590602) 因新增测试导入文件名大小写失败，未部署；修正为仓库的 simulation.js 后完成最新发布。此前手动总览发布记录保留如下。导演范围及实际分段播放核对见 [说明](DIRECTOR_ENTRY.md)。

最新统一演示：[能力总览](https://yydshly.github.io/ocean-world/?demo=all)。网页源码 `088b6d214922a9e3a150df458a0f753f79f6eac6` 的 [运行 37349644714](https://github.com/yydshly/ocean-world/actions/runs/37349644714) 构建、33 项相关检查与部署成功，部署 `6865814471` 状态为 success。基础 23 项新增 10 项入口适配检查，未声称全历史测试通过。后续仅文档/证据提交使用 skip ci，网页源码不变。实际入口与下载边界见 [演示核对](DEMO_ENTRY_AUDIT.md)。

源代码仓库：[yydshly/ocean-world](https://github.com/yydshly/ocean-world)。初始创建为私有仓库，2026-10-06获得用户授权后已公开。

## 当前发布状态

在线体验：[海底观察站](https://yydshly.github.io/ocean-world/)。GitHub Pages已启用，`PAGES_ENABLED=true`，HTTPS发布成功。仓库About也已设置在线地址。

首次公开 [发布运行37344757126](https://github.com/yydshly/ocean-world/actions/runs/37344757126) 构建及部署均通过，23项相关检查通过/0失败。当时部署源码为 `d4d008a64e8a5bd264a5d6bc912f2512b1127b5a`，GitHub部署6864983604状态为success；最新演示版本的33项检查和部署记录见文首。

已在实际浏览器打开线上页面：九区加载完成，一次读到127条活动窗口动物记录，运行/保存错误均为0，控制台错误为空；界面及沙地、岩体和生物实际呈现。本次有限检查不代表长期性能或纪录片视觉验收。浏览器自动化截图下载事件等待超时，未获得本机图片路径，不把它当作已保存的截图证据。[发布状态记录](../output/validation/github-publication-status.json) 保留完整状态。

首次私有准备时，GitHub套餐返回422拒绝私有Pages。[初次运行37343715052](https://github.com/yydshly/ocean-world/actions/runs/37343715052) 的构建/23项检查通过，但部署跳过。获授权公开后完成本次发布，初次阻塞事实保留。

## 部署流程

1. 在仓库 Settings → Pages 中使用 GitHub Actions 作为来源。
2. 在仓库 Actions variables 中将 `PAGES_ENABLED` 设为 `true`，再推送 `main` 或手动运行 “Build and deploy ocean world”。未启用发布时，工作流仍完成构建和相关检查。
3. 工作流安装锁文件中的依赖，按站点实际子目录构建，运行当前连续海床与托管集成相关检查。
4. 仅上传 `dist/client` 静态网页，再由官方 Pages 工作流发布。

`VITE_BASE_PATH` 决定构建路径。默认 `/`，保留本机与既有 Sites 构建行为；Pages 工作流按仓库名生成项目站点子目录。岩石/砂地纹理、扫描模型与解码器都使用构建基础路径。没有改动模拟规则、存档或场景效果。

```powershell
npm ci
$env:VITE_BASE_PATH = '/ocean-world/'
npm run build
npm run test:sites
```

## 源码与验证记录

本次部署准备已通过一次子目录生产构建及12项本机检查（世界集成8、托管集成4）。云端工作流检查连续海床与集成共23项，23通过/0失败，其中包含这12项，不相加为35项，不声称全历史测试通过。

首次提交包含源码、测试、资源许可/来源说明、详细历史文档和最新连续海床完整验证记录；依赖目录、构建目录、缓存及大量历史原始输出不入库，原文件继续保留在本机。最新七份状态元数据、两张实际图片和相关日志用于核查当前交付。历史 README 的部分证据链接指向本机留存输出，见 `HISTORICAL_README.md`。

浏览器使用本机 IndexedDB/localStorage 存储探索和生态。线上域名与 localhost 属于不同来源，各自拥有独立存档；部署不会自动上传或迁移当前本机探索记录。项目目前没有账号系统、云端存档或服务端生态计算。

现有 `.openai/hosting.json`、worker 与 Sites 构建接口仍保留；当前模板没有 `project_id`，这次会话没有可用的 Sites 发布接口。
