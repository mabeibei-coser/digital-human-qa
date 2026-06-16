# DEPLOY.md · 数字人问答（A900）

> 部署交给 `tencent-deploy` skill。这里记参数和约定。
> ⚠️ **形态已变**：接入讯飞 + 豆包后，A900 不再是纯静态站，**需要 node 后端常驻**（参考 A500 的部署形态）。

## 部署参数

- 上线路径：`https://h100.jsai100.com/a900/`
- 形态：**Vite 前端（build 出 dist/）+ Node/Express 后端（server.js，pm2 常驻）**
- 后端端口：`API_PORT=4009`（线上 nginx 把 `/a900/api/` 反代到该端口；server.js 已自动剥 `/a900` 前缀）
- 生产 base：`/a900/`（vite.config.js，`command === 'build'` 时生效）
- 生产启动：`npm run build` 出 dist → `NODE_ENV=production node server.js`（server.js 生产模式托管 dist/ + 提供 /api）
- GitHub 仓库：待建（首次部署由 tencent-deploy 走 `gh repo create`）

## 服务器上必须有的 .env.local（密钥，不进 git）

```
API_PORT=4009
IFLYTEK_API_KEY=...        # 讯飞 MaaS api-key:secret
IFLYTEK_MODEL=xsparkx2
VOLC_TTS_APP_KEY=...       # 豆包/火山 TTS
VOLC_TTS_ACCESS_KEY=...
VOLC_TTS_SPEAKER=zh_female_vv_uranus_bigtts
```

值从 A400 / A200 的 `.env.local` 复制（与本机一致）。

## 发版流程

1. 本地 `npm run build` 确认产物正常；`npm run dev` 自测问答+语音。
2. 走 `tencent-deploy`：建仓 → 服务器 git clone → 上传 `.env.local`（手动，不进 git）→ `npm install` → `npm run build` → pm2 start `node server.js` → nginx 追加 `/a900/` location（静态 + `/a900/api/` 反代 4009）。
3. 验证：浏览器开 `https://h100.jsai100.com/a900/` → 问一个创业问题 → 出答案 + 数字人念出来。

## 注意

- **`/api/chat` 是 SSE 流式**：nginx 对 `/a900/api/` 这段必须 `proxy_buffering off;`（并 `proxy_cache off;`），否则流式被缓冲、数字人不会提前开口（server 已发 `X-Accel-Buffering: no`，nginx 侧仍建议显式关）。
- 数字人三段视频 `public/avatar/*.webm` + 背景 `public/bg.jpg`，build 后进 dist，随产物上线。
- `public/avatar/` 里 3 个原始白底 `.mp4`（非本项目所建、未引用）部署时排除，省体积。
- 演示机想「开页即有声播欢迎语」：用项目根 `演示-有声启动.bat`（把网址改成线上地址），原理见 `欢迎语音-播放说明.md`。
