# 数字人视频资产

这个目录放数字人的三段视频。组件 `src/components/VideoAvatar.jsx` 按文件名加载，缺文件时页面显示占位图，不会报错。

| 文件名 | 状态 | 时长 | 内容 | 循环 |
|---|---|---|---|---|
| `idle.webm` | 待命 | ~5s | 眨眼、头微微动 | 是（循环） |
| `intro.webm` | 欢迎介绍 | 5–8s | 配合欢迎 / 主题介绍语 | 否（进场播一次） |
| `speaking.webm` | 常规说话 | ~8s | 嘴巴动（通用口型） | 是（回答时循环） |

## 制作要点（沿用 EXP100 经验）

- 透明背景：豆包 / 即梦等生成数字人 MP4 → `rembg` 抠成透明 → 导出带 alpha 的 **WebM（VP9 + yuva420p）**。
- ffmpeg 导出要保留 alpha：`-c:v libvpx-vp9 -pix_fmt yuva420p`，不要用会丢 alpha 的参数。
- 详细踩坑见 `EXP100-形象说话实验-avatar-speaking-lab/` 与 skill `transparent-video-avatar`。

> 也可先用不透明 MP4（带背景）跑通验证视觉，正式版再换透明 WebM。
