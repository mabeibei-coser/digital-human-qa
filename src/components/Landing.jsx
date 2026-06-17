// 前序页：一个「进入」按钮。点击是一次真实用户手势，用来解锁后续页的有声播放，
// 跳进数字人页后欢迎语能直接出声（同一文档内切换，user activation 才不丢失）。
export default function Landing({ onEnter }) {
  return (
    <div className="landing">
      <div className="landing__card">
        <span className="landing__logo">
          <svg viewBox="0 0 24 24" width="58%" height="58%" fill="none" aria-hidden="true">
            <rect x="4" y="8" width="16" height="11" rx="4" fill="currentColor" />
            <circle cx="9.5" cy="13.5" r="1.6" fill="#fff" />
            <circle cx="14.5" cy="13.5" r="1.6" fill="#fff" />
            <path d="M12 3.5v3.2" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
            <circle cx="12" cy="3" r="1.5" fill="currentColor" />
          </svg>
        </span>
        <h1 className="landing__title">创业服务智能助手</h1>
        <p className="landing__subtitle">3D 数字人 · 语音交互 · 创业政策实时问答</p>
        <button className="landing__btn" onClick={onEnter}>
          进入 3D 数字人演示
          <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor"
            strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M5 12h14" />
            <path d="M13 6l6 6-6 6" />
          </svg>
        </button>
      </div>
    </div>
  )
}
