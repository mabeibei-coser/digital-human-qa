# AGENTS.md · 数字人问答（A900 / digital-human-qa）

> 任意模型（Claude / Codex / GPT）接管本项目的单一说明书。Claude 专属补充见 `CLAUDE.md`，部署见 `DEPLOY.md`。

## 这是什么

社保局创业服务中心的「数字人 + AI 语音问答」网页 Demo。左侧三态视频数字人（待命/欢迎/说话），
右侧创业政策智能问答：**讯飞星火大模型出答案 + 豆包(火山)TTS 念出来 + 数字人说话态**。
给社保局方案汇报现场演示用。

## 技术栈 / 结构

- 前端：Vite + React（JSX），背景图 `public/bg.jpg`，三态透明数字人视频 `public/avatar/{idle,intro,speaking}.webm`
- 后端：Node + Express（`server.js`，参考 A500 形态），dotenv 读 `.env.local`，API 端口 `API_PORT=4009`
- LLM：**通义千问 `xopqwen36v35b`**（走讯飞 MaaS，OpenAI 兼容 HTTP，Bearer = `IFLYTEK_API_KEY`，**SSE 流式**）；讯飞星火本牌 `xsparkx2flash` 可换（改 `IFLYTEK_MODEL`，但开口慢约一倍）；兜底 `astron-code-latest`
- TTS：**豆包 / 火山引擎**（`openspeech.bytedance.com/api/v1/tts`，返 base64 MP3）。前端**按句流式合成播放**：边吐字边切句送 TTS、音频队列顺序播（边播当前句边合成下一句）

文件：
- `server.js` —— Express 后端。`POST /api/chat`（讯飞）、`POST /api/tts`（豆包）、`GET /api/health`
- `src/components/ChatPanel.jsx` —— 问答 UI，调 /api/chat 拿答案 → 调 /api/tts 播语音，播放时通过 `onSpeakingChange` 驱动数字人说话态
- `src/components/VideoAvatar.jsx` —— 三态视频，crossfade；intro 带欢迎语音，首次交互解锁有声（无按钮）
- `src/App.jsx` —— 状态机：intro→idle；TTS 播放→speaking→idle
- `vite.config.js` —— dev 反代 `/api`→`localhost:4009`；生产 base `/a900/`

## 本机怎么跑

```bash
npm install
# 首次：复制 .env.example → .env.local，填讯飞 + 豆包密钥（可从 A400 / A200 的 .env.local 复制）
npm run dev      # concurrently 同时起 vite(:3008) + node server.js(:4009)
```

## env 必填（见 .env.example）

| 变量 | 说明 |
|---|---|
| `IFLYTEK_API_KEY` | 讯飞 MaaS `api-key:secret`，服务端持有 |
| `IFLYTEK_MODEL` | 默认 `xopqwen36v35b`（通义千问，流式快 ~7s 开口）；换 `xsparkx2flash` 即用讯飞星火本牌（~14s） |
| `VOLC_TTS_APP_KEY` / `VOLC_TTS_ACCESS_KEY` | 豆包/火山 TTS 密钥 |
| `VOLC_TTS_SPEAKER` | 默认 `zh_female_vv_uranus_bigtts` |
| `API_PORT` | 后端端口，默认 4009 |

## 约定 / 踩坑

- **密钥只在服务端**（`server.js` 读 `.env.local`），绝不进前端 bundle / git。`.env.local` 已 gitignore。
- 客户端 fetch 用 `import.meta.env.BASE_URL` 拼 `api/...`，子路径部署才不 404；server.js 已自动剥 `/a900` 前缀。
- **讯飞模型坑**：A400 的 `IFLYTEK_FALLBACK_*`（maas-api / xop35qwen2b）实测 `AppIdNoAuthError`，弃用；该 key 实际可用模型清单（含 xsparkx2 / deepseek / glm / qwen / kimi）见 server.js 注释。
- 回答控制在 80-160 字、纯口语无 markdown（要被 TTS 朗读），见 server.js `SYSTEM_PROMPT`。
- **Windows Git Bash 用 curl 测中文会乱码**（编码坑），测后端用 node fetch，别用 curl -d 中文。

## 当前状态 / 下一步

- [x] 视觉版（背景图 + 三态数字人 + 边缘干净 + 清晰）
- [x] 欢迎语音（首次交互解锁，无按钮；演示机可用 `演示-有声启动.bat` 保证开页即出声）
- [x] **真 AI 语音问答**（讯飞星火 + 豆包 TTS），本机端到端验证通过
- [x] 前序页（「进入 3D 数字人演示」按钮 → 同文档切换到问答页，借这次手势直接有声播欢迎语，含 iOS/微信）
- [x] **已部署到 /a900**（线上 https://h100.jsai100.com/a900/，pm2 常驻、nginx /a900/→3011 反代且 buffering off）
- [ ]（可选）接 ASR 做「按住说话」语音提问

## Agent Handoff

- 当前主 Agent：Claude
- 上一手完成：加前序页（进入按钮 + 跳转后直接播欢迎语）；已部署 v0.2.6 到 /a900，线上 200 + health ok
- 必读上下文：本文件 + `DEPLOY.md` + `.planning/2026-06-16-A900-数字人问答.md`
- 决策状态：绿灯（已上线运行）；后续发版直接走 tencent-deploy 的 update 流（git pull + restart，端口 3011）
