# 数字人视频资产

这个目录放数字人的三段视频。组件 `src/components/VideoAvatar.jsx` 按文件名加载（后缀固定 `.fallback.mp4`），缺文件时页面显示占位图 `poster.jpg`，不会报错。

| 文件名 | 状态 | 时长 | 内容 | 循环 | 声音 |
|---|---|---|---|---|---|
| `idle.fallback.mp4` | 待命 | ~10s | 站立、微动 | 是（循环） | 静音 |
| `intro.fallback.mp4` | 欢迎 | ~10s | 配合欢迎语 | 否（进场播一次） | 有（欢迎语原声） |
| `speaking.fallback.mp4` | 说话 | ~10s | 嘴巴动（通用口型） | 是（回答时循环） | 静音（用 TTS） |
| `poster.jpg` | 占位图 | — | 视频加载前显示 | — | — |

## 制作要点

- **纯白底（#fff）不透明 MP4**，不是透明 webm：iOS / 微信不支持透明 webm 的 alpha 通道，会显示白框或不显示，所以统一用「不透明 mp4 + 页面同色背景」。页面数字人侧背景也是白/近白，视频白底融进去、无矩形拼接缝（见 `src/noAlpha.js`）。
- 源视频若是手机录的 HEVC，浏览器放不了，需转码为 **浏览器安全的 H.264**：
  `ffmpeg -i 源.mp4 -c:v libx264 -profile:v high -pix_fmt yuv420p -crf 19 -movflags +faststart 目标.fallback.mp4`
  （待命/说话加 `-an` 去音轨；欢迎保留 `-c:a aac` 原声。）
- 换视频后记得在 `VideoAvatar.jsx` 升一下缓存号 `V`，避免用户浏览器缓存旧视频。
- 透明数字人方案的踩坑经验见 skill `transparent-video-avatar`（本项目当前未采用透明方案）。
