import { useState } from 'react'
import VideoAvatar from './components/VideoAvatar.jsx'
import ChatPanel from './components/ChatPanel.jsx'

export default function App() {
  // 数字人状态机：进场 intro（带欢迎语音，播一次）→ idle 待命；
  // 回答时由 ChatPanel 的 TTS 播放驱动 speaking（播放期间嘴动，播完回 idle）。
  const [avatarState, setAvatarState] = useState('intro')

  return (
    <div className="page" style={{ backgroundImage: `url(${import.meta.env.BASE_URL}bg.jpg)` }}>
      <div className="layout">
        <section className="avatar-col">
          <div className="avatar-stage">
            <div className="avatar-platform" />
            <VideoAvatar state={avatarState} onIntroEnd={() => setAvatarState('idle')} />
          </div>
        </section>
        <section className="chat-col">
          <ChatPanel onSpeakingChange={(on) => setAvatarState(on ? 'speaking' : 'idle')} />
        </section>
      </div>
    </div>
  )
}
