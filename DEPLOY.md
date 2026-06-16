# DEPLOY.md · 数字人问答（A900）

> 部署交给 `tencent-deploy` skill。这里只记参数和约定。

## 部署参数

- 上线路径：`https://h100.jsai100.com/a900/`
- 形态：纯前端静态站（`npm run build` → `dist/`），nginx 子路径托管，无后端无端口。
- 生产 base：`/a900/`（已在 `vite.config.js` 配好，`command === 'build'` 时生效）。
- GitHub 仓库：待建（首次部署时由 tencent-deploy 走 `gh repo create`）。

## 发版流程

1. 本地 `npm run build` 确认产物正常。
2. 走 `tencent-deploy`：合 main → 打 tag → 服务器 git pull → 重新 build → nginx 生效。
3. 验证：`curl https://h100.jsai100.com/a900/` + 浏览器实测数字人视频与问答交互。

## 注意

- 数字人视频在 `public/avatar/`，build 后进 `dist/avatar/`，确认随产物一起上线。
- 首次部署需在 nginx 追加 `/a900/` location（tencent-deploy 自动处理）。
