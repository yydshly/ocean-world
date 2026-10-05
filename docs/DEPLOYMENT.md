# GitHub 与网页部署

更新：2026-10-06。

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
