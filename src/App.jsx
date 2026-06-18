import { useState } from 'react'
import VideoAvatar from './components/VideoAvatar.jsx'
import ChatPanel from './components/ChatPanel.jsx'
import Landing from './components/Landing.jsx'
import { NO_ALPHA, PAGE_TEAL } from './noAlpha.js'

export default function App() {
  // 前序首页 → 数字人页（同一文档内切换，不跳网址）：点按钮是一次真实手势，
  // 解锁有声播放，切到数字人页后欢迎语能直接出声（见 VideoAvatar autoUnlock）。
  const [entered, setEntered] = useState(false)

  // 数字人状态机：进场 intro（带欢迎语音，播一次）→ idle 待命；
  // 回答时由 ChatPanel 的 TTS 播放驱动 speaking（播放期间嘴动，播完回 idle）。
  const [avatarState, setAvatarState] = useState('intro')

  // 当前数字人形象（哪套视频）。两个入口除了形象不同，其余页面完全共用。见 src/avatars.js。
  const [variant, setVariant] = useState('default')

  function enter(which) {
    setVariant(which)
    setAvatarState('intro') // 每次进场重新播一次欢迎
    setEntered(true)
  }

  // 桌面：背景大图 + 透明数字人；iOS/微信：纯色 + 不透明数字人（同色，无拼接缝）
  const bgUrl = `${import.meta.env.BASE_URL}bg.jpg`
  const mobileBgUrl = `${import.meta.env.BASE_URL}mobile-service-hall-bg.png`
  const pageStyle = NO_ALPHA
    ? { background: PAGE_TEAL, '--mobile-bg': `url(${mobileBgUrl})` }
    : { backgroundImage: `url(${bgUrl})`, '--mobile-bg': `url(${mobileBgUrl})` }

  function goHome() {
    setEntered(false)
    setAvatarState('intro') // 回首页后再进，重新播一次欢迎
  }

  return (
    <div className="page" style={pageStyle}>
      {!entered && (
        <div className="home-landing">
          <Landing
            onEnter={() => enter('default')}
            onSim={() => enter('sim')}
          />
        </div>
      )}

      <div className={'layout' + (entered ? '' : ' is-hidden')}>
        <section className="avatar-col">
          {entered && (
            <button type="button" className="back-home" onClick={goHome} aria-label="返回首页">
              <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor"
                strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M15 18l-6-6 6-6" />
              </svg>
              返回
            </button>
          )}
          <div className="mobile-hero-copy">
            <h1>
              <span>创业服务</span>
              <span>智能助手</span>
            </h1>
            <p>政策咨询 · 办事指引 · 申领测算</p>
            <span className="mobile-hero-copy__online">
              <i />
              在线服务中
            </span>
          </div>

          <div className="avatar-stage">
            <div className="avatar-platform" />
            <VideoAvatar
              key={variant}
              variant={variant}
              state={avatarState}
              autoUnlock={entered}
              onIntroEnd={() => setAvatarState('idle')}
            />
          </div>
        </section>
        <section className="chat-col">
          <ChatPanel onSpeakingChange={(on) => setAvatarState(on ? 'speaking' : 'idle')} />
        </section>
      </div>
    </div>
  )
}
