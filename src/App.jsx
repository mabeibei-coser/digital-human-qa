import { useEffect, useState } from 'react'
import VideoAvatar from './components/VideoAvatar.jsx'
import ChatPanel from './components/ChatPanel.jsx'

export default function App() {
  // 数字人状态机：进场先播「欢迎介绍」→ 结束回「待命」；用户提问 →「说话」→ 几秒后回「待命」
  const [avatarState, setAvatarState] = useState('intro')

  function handleAsk() {
    setAvatarState('speaking')
  }

  useEffect(() => {
    if (avatarState === 'speaking') {
      // 演示用固定时长；正式版接 TTS 后跟随语音时长
      const t = setTimeout(() => setAvatarState('idle'), 4000)
      return () => clearTimeout(t)
    }
  }, [avatarState])

  return (
    <div className="app">
      <header className="topbar">
        <div className="topbar__brand">
          <span className="topbar__logo">创</span>
          <div>
            <h1>创业服务中心 · 智能数字人</h1>
            <p>AI 问答 · 政策咨询 · 创业引导</p>
          </div>
        </div>
        <span className="topbar__tag">方案演示 Demo</span>
      </header>

      <main className="stage">
        <section className="stage__avatar">
          <VideoAvatar
            state={avatarState}
            onIntroEnd={() => setAvatarState('idle')}
          />
          <div className="stage__welcome">
            <h2>您好，我是您的创业服务助手</h2>
            <p>创业、就业、社保政策的问题，都可以问我。</p>
          </div>
        </section>

        <section className="stage__chat">
          <ChatPanel onAsk={handleAsk} />
        </section>
      </main>
    </div>
  )
}
