import { useEffect, useMemo, useRef, useState } from 'react'
import { flushSync } from 'react-dom'
import VideoAvatar from './components/VideoAvatar.jsx'
import ChatPanel from './components/ChatPanel.jsx'
import Landing from './components/Landing.jsx'
import { NO_ALPHA, PAGE_TEAL } from './noAlpha.js'
import welcomeConfig from './welcome.config.json'

const LOOP_STATES = new Set(['idle', 'intro', 'speaking'])

function readLoopConfig() {
  const params = new URLSearchParams(window.location.search)
  if (params.get('avatarLoop') !== '1') return null

  const sequence = (params.get('sequence') || 'idle,intro,speaking')
    .split(',')
    .map((item) => item.trim())
    .filter((item) => LOOP_STATES.has(item))

  return {
    variant: params.get('variant') === 'sim' ? 'sim' : 'default',
    rounds: Math.max(1, Number(params.get('rounds')) || 50),
    intervalMs: Math.max(220, Number(params.get('interval')) || 420),
    sequence: sequence.length ? sequence : ['idle', 'intro', 'speaking'],
  }
}

export default function App() {
  const loopConfig = useMemo(readLoopConfig, [])
  const welcomeAudioRef = useRef(null)
  const welcomePlayingRef = useRef(false)
  const [entered, setEntered] = useState(Boolean(loopConfig))
  const [avatarState, setAvatarState] = useState(loopConfig?.sequence[0] || 'intro')
  const [variant, setVariant] = useState(loopConfig?.variant || 'default')
  const baseUrl = import.meta.env.BASE_URL
  const welcomeAudioUrl = `${baseUrl}${welcomeConfig.audio}?v=${welcomeConfig.version}`

  useEffect(() => {
    if (!loopConfig) return undefined

    let step = 0
    const totalSteps = loopConfig.rounds * loopConfig.sequence.length
    const publish = (done = false) => {
      window.__A900_AVATAR_LOOP__ = {
        enabled: true,
        done,
        step,
        totalSteps,
        rounds: loopConfig.rounds,
        intervalMs: loopConfig.intervalMs,
        state: loopConfig.sequence[step % loopConfig.sequence.length],
        variant: loopConfig.variant,
      }
    }

    setEntered(true)
    setVariant(loopConfig.variant)
    setAvatarState(loopConfig.sequence[0])
    publish(false)

    const timer = window.setInterval(() => {
      step += 1
      if (step >= totalSteps) {
        publish(true)
        window.clearInterval(timer)
        return
      }
      const nextState = loopConfig.sequence[step % loopConfig.sequence.length]
      setAvatarState(nextState)
      publish(false)
    }, loopConfig.intervalMs)

    return () => window.clearInterval(timer)
  }, [loopConfig])

  function stopWelcomeAudio({ reset = true } = {}) {
    const audio = welcomeAudioRef.current
    welcomePlayingRef.current = false
    if (!audio) return
    try {
      audio.pause()
      if (reset) audio.currentTime = 0
    } catch {
      /* ignore */
    }
  }

  function playWelcomeAudio(syncVideo) {
    if (loopConfig) return
    const audio = welcomeAudioRef.current
    if (!audio) return
    // 不重设 src：JSX 已设同一地址且 preload 好了，重设会触发重新加载、给音频引入起播延迟。
    welcomePlayingRef.current = true
    try {
      audio.pause()
      audio.currentTime = 0
    } catch {
      /* ignore */
    }
    const played = audio.play()
    if (played && typeof played.catch === 'function') {
      played.catch(() => {
        welcomePlayingRef.current = false
      })
    }

    // 视频从 display:none 揭开后首帧解码有延迟、音频却已开播 → 声音领先于嘴动。
    // 用视频「首帧真正渲染」的时刻把音频拨回到与视频同一时间点，消除起播漂移。
    if (syncVideo && typeof syncVideo.requestVideoFrameCallback === 'function') {
      syncVideo.requestVideoFrameCallback(() => {
        try {
          const drift = audio.currentTime - syncVideo.currentTime
          if (drift > 0.08) audio.currentTime = Math.max(0, syncVideo.currentTime)
        } catch {
          /* ignore */
        }
      })
    }
  }

  function enter(which) {
    flushSync(() => {
      setVariant(which)
      setAvatarState('intro')
      setEntered(true)
    })

    const intro = document.querySelector('.avatar__clip--intro')
    if (intro) {
      try {
        intro.currentTime = 0
      } catch {
        /* ignore */
      }
      intro.muted = true
      intro.play().catch(() => {})
    }
    playWelcomeAudio(intro)
  }

  const bgUrl = `${baseUrl}bg.jpg`
  const mobileBgUrl = `${baseUrl}mobile-service-hall-bg.png`
  const pageStyle = NO_ALPHA
    ? { background: PAGE_TEAL, '--mobile-bg': `url(${mobileBgUrl})` }
    : { backgroundImage: `url(${bgUrl})`, '--mobile-bg': `url(${mobileBgUrl})` }

  function goHome() {
    if (loopConfig) return
    stopWelcomeAudio()
    setEntered(false)
    setAvatarState('intro')
  }

  function handleChatSpeakingChange(on) {
    if (loopConfig) return
    stopWelcomeAudio()
    setAvatarState(on ? 'speaking' : 'idle')
  }

  const pageVariant = entered ? variant : 'home'

  return (
    <div className={'page page--' + pageVariant} style={pageStyle}>
      <audio
        ref={welcomeAudioRef}
        src={welcomeAudioUrl}
        preload="auto"
        hidden
        onEnded={() => {
          welcomePlayingRef.current = false
          if (!loopConfig) setAvatarState('idle')
        }}
        onError={() => {
          welcomePlayingRef.current = false
        }}
      />
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
          {entered && !loopConfig && (
            <button type="button" className="back-home" onClick={goHome} aria-label="返回首页">
              <svg
                viewBox="0 0 24 24"
                width="18"
                height="18"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.2"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
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

          <div className={'avatar-stage avatar-stage--' + variant}>
            <div className="avatar-platform" />
            <VideoAvatar
              key={variant}
              variant={variant}
              state={avatarState}
              onIntroEnd={() => {
                if (!loopConfig && !welcomePlayingRef.current) setAvatarState('idle')
              }}
            />
          </div>
        </section>
        <section className="chat-col">
          <ChatPanel onSpeakingChange={handleChatSpeakingChange} />
        </section>
      </div>
    </div>
  )
}
