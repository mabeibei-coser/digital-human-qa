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
- [x] **手机页精致化**（对照设计图3：图标线条调细、标题字号/字重降档、热门事项拆成独立小卡、面板可轻微滚动；只改手机端，桌面不动）
- [x] **接 ASR 语音提问**（点麦克风录音→火山 ASR→自动当问题发出）：复用 TTS 同密钥，`POST /api/asr`（原始音频直传，webm/mp4 经 ffmpeg 转 wav），本机 TTS→ASR 端到端自测通过（mp3/webm 双路径准确）
- [x] **第二个数字人形象（3D 数字仿真人）**：落地页「3D 数字仿真人演示」按钮接通（原是 alert 占位），点进去是**同一套页面/问答/语音**，只换人物视频（白底新形象）。形象配置收敛到单一来源 `src/avatars.js`，`VideoAvatar` 加 `variant` 入参；本机 DOM 度量两入口视频源切换正确、画面渲染播放均通过。
  - 新视频在 `public/avatar-sim/`（待机→idle、欢迎→intro，均 HEVC 转码为 H.264 白底）；**说话视频未生成**，暂用欢迎视频占位（`avatars.js` 里 `sim.files.speaking: 'intro'`），生成后改一行 + 放 `speaking.fallback.mp4` 即可。

## ASR 接入要点（新增）

- 后端 `server.js` 新增 `/api/asr`：读原始二进制音频 → 火山 `recognize/flash` 端点 → `{ text }`。密钥复用 `VOLC_TTS_APP_KEY/ACCESS_KEY`，可选 `VOLC_ASR_RESOURCE_ID`（默认 `volc.bigasr.auc_turbo`）。
- 前端 `ChatPanel.jsx`：麦克风从装饰 span 改为 button，点开始/再点结束录音，识别成功自动 `send()`。仅手机端显示（桌面输入栏无麦克风）。
- **部署依赖**：服务器需装 **ffmpeg**（webm→wav 转码用）。本机已有；腾讯 Lighthouse 上线前需确认 `ffmpeg -version` 可用，否则录音转码失败（仅影响语音，文字问答不受影响）。

## Agent Handoff

- 当前主 Agent：Claude（上一手：新增第二个数字人形象「3D 数字仿真人」）
- 上一手完成：落地页第二个按钮接通成「同页面换形象」；形象配置收敛到单一来源 `src/avatars.js`（改一处两处同步），`VideoAvatar` 加 `variant` 入参；新视频转码进 `public/avatar-sim/`（说话态暂用欢迎占位）。本机 preview DOM 度量两入口视频源切换正确、渲染播放通过。**改动未提交、未部署**；ASR 那一手也仍未部署。
- 下一手建议：codex 走 tencent-deploy update 流上线（git pull + restart，端口 3011）；**上线前确认服务器装了 ffmpeg**（ASR 用）。git add 含 `public/avatar-sim/*.mp4`（约 1.3MB，体积同现有 avatar，无需 LFS）。
- 必读上下文：本文件 + `DEPLOY.md` + `src/avatars.js`（形象单一来源）
- 文件占用：本次新增 `src/avatars.js`、`public/avatar-sim/`，改了 `src/App.jsx`、`src/components/VideoAvatar.jsx`；codex 部署只读不改这些
- 决策状态：绿灯（功能验证通过，待部署）；待办：真说话视频生成后替换占位
