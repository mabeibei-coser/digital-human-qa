// iOS / 微信 / 触屏 Safari 不支持透明 WebM 的 alpha（会显示白底或不显示）→
// 这些端改用「不透明 mp4 + 纯色背景」：数字人烤底色与页面背景同色，避免矩形拼接缝。
// 桌面 / 安卓 Chrome 支持 alpha → 用透明 webm + 背景大图（更精致）。
const UA = typeof navigator !== 'undefined' ? navigator.userAgent || '' : ''
export const NO_ALPHA =
  /iP(hone|ad|od)/.test(UA) ||
  /MicroMessenger/i.test(UA) ||
  (typeof navigator !== 'undefined' && navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)

// 移动端纯色背景，必须与数字人视频烤底色一致（视频烤底为近白影棚底，采样约 #fafafa）
export const PAGE_TEAL = '#fafafa'
