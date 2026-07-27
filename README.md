# 数字人问答（A900 · digital-human-qa）

一个「数字人 + AI 语音问答」的网页 Demo：左侧会眨眼/说话的数字人（三段视频切状态），右侧创业政策智能问答——**Gemini 大模型出答案，豆包 TTS 念出来，数字人跟着开口**。
**谁在用 / 用在哪**：永升服务为社保局（创业服务中心）准备的方案演示，现场汇报展示；规划上线在 `h100.jsai100.com/a900/`。

## 能力

- 打字或点建议问题 → BananaRouter Gemini-native 流式回答创业政策（补贴/担保贷款/开办流程/社保等）
- 答案由豆包（火山引擎）TTS 合成语音播报，数字人切「说话」态，播完回「待命」
- 打开页面自动播欢迎语（数字人三态：待命 / 欢迎 / 常规说话）

## 本地运行

```bash
npm install
# 首次：cp .env.example .env.local，填 BananaRouter + 豆包密钥
npm run dev      # 同时起前端 vite(:3008) + 后端 node server.js(:4009)，打开终端给出的地址
```

构建：`npm run build`（产物 `dist/`，生产 base `/a900/`）。

## 技术栈

Vite + React 前端 ｜ Node + Express 后端（密钥服务端持有）｜ Gemini LLM ｜ 豆包/火山 TTS。
详见 `AGENTS.md`，部署见 `DEPLOY.md`，自动播放说明见 `欢迎语音-播放说明.md`。

## 数字人三种状态

| 状态 | 说明 |
|---|---|
| 待命 | 循环，眨眼、头微动 |
| 欢迎介绍 | 进场播一次，带欢迎语音 |
| 常规说话 | 回答时播，嘴动（跟随 TTS 播放时长） |

视频资产 `public/avatar/`，背景图 `public/bg.jpg`。形象技术沿用 `EXP100-形象说话实验`（透明 WebM，RVM 抠像）。

## 相关项目

- `EXP100-形象说话实验`：数字人视频形象技术来源。
- `A100-简历优化` / `A200-模拟面试`：Gemini-native LLM 的接法参考来源；火山 TTS/ASR 保持独立。
