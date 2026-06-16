# AGENTS.md · 数字人问答（A900 / digital-human-qa）

> 任意模型（Claude / Codex / GPT）接管本项目的单一说明书。Claude 专属补充见 `CLAUDE.md`，部署见 `DEPLOY.md`。

## 这是什么

社保局创业服务中心的「数字人 + AI 问答」网页 Demo，用于方案汇报演示。
左侧数字人（几段视频切换：待命 / 欢迎 / 说话三态），右侧创业政策智能问答。

第一版定位 **视觉惊艳的演示稿**：回答走脚本化（`ChatPanel.jsx` 里的演示文案），先不接真 AI，接口留好。

## 技术栈 / 结构

- Vite + React（JSX，纯前端静态站，无后端无 DB）
- `src/App.jsx` —— 页面骨架 + 数字人状态机（intro → idle，提问 → speaking → idle）
- `src/components/VideoAvatar.jsx` —— 三态视频数字人，缺视频时显示占位图（不报错）
- `src/components/ChatPanel.jsx` —— 问答 UI + 建议问题 + 脚本化演示回答
- `public/avatar/` —— 数字人三段视频（idle / intro / speaking.webm），见该目录 README
- `vite.config.js` —— 生产 base = `/a900/`，本地 dev = `/`

## 约定

- 视频路径用 `import.meta.env.BASE_URL` 拼，别写死 `/`，否则子路径部署会 404。
- 数字人形象技术沿用 `EXP100-形象说话实验`（透明 WebM）；skill：`transparent-video-avatar`。
- 改前端视觉可用 skill：`frontend-design` / `redesign-skill`。

## 当前状态 / 下一步

- [x] 项目骨架：可 `npm run dev` 跑起来（占位数字人 + 脚本化问答）
- [ ] 视觉精修到「惊艳演示稿」级别（首页 / 配色 / 动效 / 移动端）
- [ ] 接入真实数字人三段视频（待用户提供 / 生成）
- [ ] （可选）接真 AI 问答 + TTS 语音播报，说话态跟随
- [ ] 部署到 /a900（走 tencent-deploy）

## Agent Handoff

- 当前主 Agent：Claude
- 上一手完成：搭好项目骨架（Vite+React 静态站），已注册 PROJECTS.md
- 下一手建议：与用户确认视觉风格 + 数字人视频后，进入「视觉精修」phase
- 必读上下文：本文件 + `README.md` + `.planning/2026-06-16-A900-数字人问答.md`
- 决策状态：绿灯（骨架已就绪）
