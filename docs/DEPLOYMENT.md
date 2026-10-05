# GitHub 与网页部署

更新：2026-10-06。

源代码仓库：[yydshly/ocean-world](https://github.com/yydshly/ocean-world)。初始创建为私有仓库。

## 当前发布状态

本机已完成 `/ocean-world/` 子目录生产构建，并配置 `.github/workflows/pages.yml`。GitHub 当前账号套餐拒绝为私有仓库启用 Pages；在获得公开仓库授权或改用其他托管之前，网页尚未上线。

GitHub Pages 的目标地址为 `https://yydshly.github.io/ocean-world/`；目标地址不能当作已成功发布的证明，实际状态以 Actions 部署记录为准。

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

本次部署准备已通过一次子目录生产构建及12项本机检查（世界集成8、托管集成4）。云端工作流再检查连续海床与集成共23项，其中包含这12项，不相加为35项，不声称全历史测试通过。

首次提交包含源码、测试、资源许可/来源说明、详细历史文档和最新连续海床完整验证记录；依赖目录、构建目录、缓存及大量历史原始输出不入库，原文件继续保留在本机。最新七份状态元数据、两张实际图片和相关日志用于核查当前交付。历史 README 的部分证据链接指向本机留存输出，见 `HISTORICAL_README.md`。

浏览器使用本机 IndexedDB/localStorage 存储探索和生态。线上域名与 localhost 属于不同来源，各自拥有独立存档；部署不会自动上传或迁移当前本机探索记录。项目目前没有账号系统、云端存档或服务端生态计算。

现有 `.openai/hosting.json`、worker 与 Sites 构建接口仍保留；当前模板没有 `project_id`，这次会话没有可用的 Sites 发布接口。
