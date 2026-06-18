# 数字人视频资产 · 仿真人（avatar-sim）

「3D 数字仿真人演示」入口用的形象。结构与默认形象 `../avatar/` 完全一致，只是换了人物视频（白底 #fff，H.264）。形象的挂载在单一来源 `src/avatars.js` 里配置（`AVATARS.sim`），换形象只动那里。

| 文件名 | 状态 | 内容 | 循环 | 声音 |
|---|---|---|---|---|
| `idle.fallback.mp4` | 待命 | 来源「待机 (2).mp4」 | 是 | 静音 |
| `intro.fallback.mp4` | 欢迎 | 来源「欢迎 (2).mp4」 | 否（播一次） | 有（欢迎语原声） |
| `poster.jpg` | 占位图 | idle 首帧 | — | — |

## 注意：暂无 speaking.fallback.mp4

说话态视频还没生成，**当前由欢迎视频占位**——`src/avatars.js` 里 `sim.files.speaking` 指向 `'intro'`，即「欢迎」和「说话」两态共用 `intro.fallback.mp4` 这一份文件（说话态在组件里强制静音，不会漏出欢迎语）。

生成了真正的说话视频后：把它转码放成 `speaking.fallback.mp4`（去音轨 `-an`），再把 `src/avatars.js` 里 `sim.files.speaking: 'intro'` 改回 `'speaking'` 即可。

## 转码命令（源视频是手机 HEVC，浏览器放不了，须转 H.264）

```bash
# 待命（去音轨）
ffmpeg -i "待机.mp4" -c:v libx264 -profile:v high -pix_fmt yuv420p -crf 19 -movflags +faststart -an idle.fallback.mp4
# 欢迎（保留原声）
ffmpeg -i "欢迎.mp4" -c:v libx264 -profile:v high -pix_fmt yuv420p -crf 19 -movflags +faststart -c:a aac intro.fallback.mp4
```
