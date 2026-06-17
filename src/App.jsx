import { useState } from 'react'
import VideoAvatar from './components/VideoAvatar.jsx'
import ChatPanel from './components/ChatPanel.jsx'
import Landing from './components/Landing.jsx'
import { NO_ALPHA, PAGE_TEAL } from './noAlpha.js'

export default function App() {
  // 前序页 → 数字人页（同一文档内切换，不跳网址）：点「进入」是一次真实手势，
  // 解锁有声播放，切到数字人页后欢迎语能直接出声（见 VideoAvatar autoUnlock）。
  const [entered, setEntered] = useState(false)

  // 数字人状态机：进场 intro（带欢迎语音，播一次）→ idle 待命；
  // 回答时由 ChatPanel 的 TTS 播放驱动 speaking（播放期间嘴动，播完回 idle）。
  const [avatarState, setAvatarState] = useState('intro')

  // 桌面：背景大图 + 透明数字人；iOS/微信：纯色青绿 + 不透明数字人（同色，无拼接缝）
  const pageStyle = NO_ALPHA
    ? { background: PAGE_TEAL }
    : { backgroundImage: `url(${import.meta.env.BASE_URL}bg.jpg)` }

  return (
    <div className="page" style={pageStyle}>
      {!entered ? (
        <Landing onEnter={() => setEntered(true)} />
      ) : (
        <div className="layout">
          <section className="avatar-col">
            <div className="avatar-stage">
              <div className="avatar-platform" />
              <VideoAvatar state={avatarState} autoUnlock onIntroEnd={() => setAvatarState('idle')} />
            </div>
          </section>
          <section className="chat-col">
            <ChatPanel onSpeakingChange={(on) => setAvatarState(on ? 'speaking' : 'idle')} />
          </section>
        </div>
      )}
    </div>
  )
}
