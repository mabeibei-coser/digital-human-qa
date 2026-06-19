import { useEffect, useMemo, useState } from 'react'
import { flushSync } from 'react-dom'
import VideoAvatar from './components/VideoAvatar.jsx'
import ChatPanel from './components/ChatPanel.jsx'
import Landing from './components/Landing.jsx'
import { NO_ALPHA, PAGE_TEAL } from './noAlpha.js'

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
  const [entered, setEntered] = useState(Boolean(loopConfig))
  const [avatarState, setAvatarState] = useState(loopConfig?.sequence[0] || 'intro')
  const [variant, setVariant] = useState(loopConfig?.variant || 'default')

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

  function enter(which) {
    flushSync(() => {
      setVariant(which)
      setAvatarState('intro')
      setEntered(true)
    })

    const intro = document.querySelector('.avatar__clip--intro')
    if (intro) {
      intro.dataset.a900GestureUnlocked = 'true'
      intro.muted = false
      intro.play().catch(() => {})
    }
  }

  const bgUrl = `${import.meta.env.BASE_URL}bg.jpg`
  const mobileBgUrl = `${import.meta.env.BASE_URL}mobile-service-hall-bg.png`
  const pageStyle = NO_ALPHA
    ? { background: PAGE_TEAL, '--mobile-bg': `url(${mobileBgUrl})` }
    : { backgroundImage: `url(${bgUrl})`, '--mobile-bg': `url(${mobileBgUrl})` }

  function goHome() {
    if (loopConfig) return
    setEntered(false)
    setAvatarState('intro')
  }

  const pageVariant = entered ? variant : 'home'

  return (
    <div className={'page page--' + pageVariant} style={pageStyle}>
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
              autoUnlock={entered}
              onIntroEnd={() => {
                if (!loopConfig) setAvatarState('idle')
              }}
            />
          </div>
        </section>
        <section className="chat-col">
          <ChatPanel
            onSpeakingChange={(on) => {
              if (!loopConfig) setAvatarState(on ? 'speaking' : 'idle')
            }}
          />
        </section>
      </div>
    </div>
  )
}
