// 前序首页：两个演示入口。点击是一次真实用户手势，用来解锁后续页的有声播放，
// 跳进数字人页后欢迎语能直接出声（同一文档内切换，user activation 才不丢失）。
function Arrow() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M5 12h14" />
      <path d="M13 6l6 6-6 6" />
    </svg>
  )
}

function StageIcon() {
  return (
    <svg viewBox="0 0 128 128" aria-hidden="true">
      <defs>
        <linearGradient id="landing-stage-person" x1="34" y1="18" x2="91" y2="103" gradientUnits="userSpaceOnUse">
          <stop stopColor="#ffffff" />
          <stop offset="1" stopColor="#c8fbf3" />
        </linearGradient>
        <linearGradient id="landing-stage-ring" x1="17" y1="83" x2="111" y2="100" gradientUnits="userSpaceOnUse">
          <stop stopColor="#83fff0" />
          <stop offset="1" stopColor="#049c91" />
        </linearGradient>
      </defs>
      <ellipse cx="64" cy="93" rx="50" ry="17" fill="none" stroke="url(#landing-stage-ring)" strokeWidth="10" />
      <ellipse cx="64" cy="93" rx="34" ry="10" fill="#dffdfa" opacity="0.82" />
      <path d="M31 92c8-22 24-32 33-32s25 10 33 32c-9 8-57 8-66 0Z" fill="url(#landing-stage-person)" />
      <circle cx="64" cy="40" r="24" fill="url(#landing-stage-person)" />
      <path d="M41 92c7 6 39 8 54 0" fill="none" stroke="#ffffff" strokeWidth="5" opacity="0.75" strokeLinecap="round" />
    </svg>
  )
}

function ScanIcon() {
  return (
    <svg viewBox="0 0 128 128" aria-hidden="true">
      <defs>
        <linearGradient id="landing-scan-person" x1="42" y1="42" x2="86" y2="105" gradientUnits="userSpaceOnUse">
          <stop stopColor="#16cdb6" />
          <stop offset="1" stopColor="#07877d" />
        </linearGradient>
      </defs>
      <path d="M30 46V30h16M82 30h16v16M98 82v16H82M46 98H30V82" fill="none" stroke="currentColor" strokeWidth="8" strokeLinecap="round" />
      <circle cx="64" cy="51" r="19" fill="url(#landing-scan-person)" />
      <path d="M31 100c7-25 25-36 33-36s26 11 33 36H31Z" fill="url(#landing-scan-person)" />
    </svg>
  )
}

function ShieldIcon() {
  return (
    <svg viewBox="0 0 48 48" aria-hidden="true">
      <path d="M24 5 40 11v12c0 10-6.5 17-16 20C14.5 40 8 33 8 23V11l16-6Z" fill="currentColor" />
      <path d="m18 24 4 4 8-10" fill="none" stroke="#fff" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

function Laurel({ side }) {
  const leaves = [
    [18, 77, -34], [23, 62, -25], [30, 48, -17], [39, 36, -9], [49, 26, 0],
  ]

  return (
    <svg className={`landing__laurel landing__laurel--${side}`} viewBox="0 0 68 104" aria-hidden="true">
      <path d="M55 10C30 29 18 56 18 94" fill="none" stroke="currentColor" strokeWidth="4" strokeLinecap="round" />
      {leaves.map(([cx, cy, rotate]) => (
        <ellipse key={`${cx}-${cy}`} cx={cx} cy={cy} rx="7" ry="13" transform={`rotate(${rotate} ${cx} ${cy})`} fill="currentColor" />
      ))}
    </svg>
  )
}

export default function Landing({ onEnter, onSim }) {
  const bgSrc = `${import.meta.env.BASE_URL}entrepreneurship-assistant-bg.png`

  return (
    <div className="landing">
      <div className="landing__canvas">
        <img className="landing__bg" src={bgSrc} width="853" height="1844" alt="" aria-hidden="true" />
        <h1 className="landing__title">创业服务智能助手</h1>
        <p className="landing__subtitle">3D 数字人 · 语音交互 · 创业政策实时问答</p>
        <div className="landing__btns">
          <button type="button" className="landing__btn" onClick={onEnter}>
            <span className="landing__btn-icon landing__btn-icon--stage">
              <StageIcon />
            </span>
            <span className="landing__btn-label">3D 数字人演示</span>
            <span className="landing__btn-arrow">
              <Arrow />
            </span>
          </button>
          <button type="button" className="landing__btn landing__btn--alt" onClick={onSim}>
            <span className="landing__btn-icon landing__btn-icon--scan">
              <ScanIcon />
            </span>
            <span className="landing__btn-label">3D 数字仿真人演示</span>
            <span className="landing__btn-arrow">
              <Arrow />
            </span>
          </button>
        </div>
        <div className="landing__trust" aria-label="专业可靠 · 隐私保护 · 安全可信">
          <Laurel side="left" />
          <ShieldIcon />
          <span>专业可靠 · 隐私保护 · 安全可信</span>
          <Laurel side="right" />
        </div>
      </div>
    </div>
  )
}
