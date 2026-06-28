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
  const welcomeSeqRef = useRef(0)
  const [entered, setEntered] = useState(Boolean(loopConfig))
  const [avatarState, setAvatarState] = useState(loopConfig?.sequence[0] || 'intro')
  const [variant, setVariant] = useState(loopConfig?.variant || 'default')
  const [welcomeHold, setWelcomeHold] = useState(false)
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

  const HOLD_MS = 700 // 全部就绪后、起播前的停顿（用户要求 0.5~1s）

  function stopWelcomeAudio({ reset = true } = {}) {
    welcomeSeqRef.current += 1 // 取消任何在途的起播编排
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

  // 等媒体缓冲到「能往前连续播」（readyState>=HAVE_FUTURE_DATA，首帧已解码），最多兜底等 timeoutMs
  function waitReady(media, timeoutMs) {
    return new Promise((resolve) => {
      if (!media || media.readyState >= 3) return resolve()
      let done = false
      const finish = () => {
        if (done) return
        done = true
        clearTimeout(timer)
        ;['canplay', 'canplaythrough'].forEach((e) => media.removeEventListener(e, finish))
        resolve()
      }
      const timer = setTimeout(finish, timeoutMs)
      ;['canplay', 'canplaythrough'].forEach((e) => media.addEventListener(e, finish, { once: true }))
    })
  }

  // 起播编排：① 等视频+音频都缓冲就绪 → ② 停顿 → ③ 视频音频从 0 一起播
  async function runWelcomeSequence(intro) {
    if (loopConfig) return
    const audio = welcomeAudioRef.current
    const token = (welcomeSeqRef.current += 1)
    const cancelled = () => token !== welcomeSeqRef.current

    await Promise.all([waitReady(intro, 2500), waitReady(audio, 2500)])
    if (cancelled()) return

    await new Promise((resolve) => setTimeout(resolve, HOLD_MS))
    if (cancelled() || !intro || !audio) return

    // 解除冻结（用普通 setState：本函数同步把视频起播后 React 再提交，keepalive 不会来抢）
    setWelcomeHold(false)
    try { intro.currentTime = 0 } catch { /* ignore */ }
    try { audio.currentTime = 0 } catch { /* ignore */ }
    intro.muted = true
    welcomePlayingRef.current = true

    const startAudio = () => {
      if (cancelled()) return
      try { audio.currentTime = Math.max(0, intro.currentTime) } catch { /* ignore */ }
      const ap = audio.play()
      if (ap && typeof ap.catch === 'function') ap.catch(() => { welcomePlayingRef.current = false })
    }

    const vp = intro.play()
    if (vp && typeof vp.catch === 'function') vp.catch(() => {})

    // 音频卡视频「首帧渲染」那一刻开播，保证两边同点起跑
    if (typeof intro.requestVideoFrameCallback === 'function') {
      let started = false
      const fire = () => { if (started || cancelled()) return; started = true; startAudio() }
      intro.requestVideoFrameCallback(fire)
      setTimeout(fire, 300) // 兜底：个别浏览器 rVFC 不回调
    } else {
      startAudio()
    }
  }

  function enter(which) {
    flushSync(() => {
      setVariant(which)
      setAvatarState('intro')
      setWelcomeHold(true) // 先把数字人冻结在首帧，避免揭开瞬间多个控制器抢着乱播
      setEntered(true)
    })

    // 在用户手势内「点亮」音频（iOS / 微信要求）：play 一下随即暂停归零，之后在手势外
    // 再 play 才不被拦（元素已解锁）。welcome.mp3 开头是静音，这一下点亮听不到声。
    const audio = welcomeAudioRef.current
    if (audio && !loopConfig) {
      try {
        audio.muted = false
        audio.currentTime = 0
        const ap = audio.play()
        if (ap && typeof ap.then === 'function') {
          ap.then(() => {
            audio.pause()
            try { audio.currentTime = 0 } catch { /* ignore */ }
          }).catch(() => {})
        }
      } catch {
        /* ignore */
      }
    }

    // 让视频解码出首帧后停住（冻结在第 0 帧，等编排统一起播）
    const intro = document.querySelector('.avatar__clip--intro')
    if (intro) {
      intro.muted = true
      try { intro.currentTime = 0 } catch { /* ignore */ }
      const vp = intro.play()
      if (vp && typeof vp.then === 'function') {
        vp.then(() => intro.pause()).catch(() => {})
      }
    }

    runWelcomeSequence(intro)
  }

  const bgUrl = `${baseUrl}bg.jpg`
  const mobileBgUrl = `${baseUrl}mobile-service-hall-bg.png`
  const pageStyle = NO_ALPHA
    ? { background: PAGE_TEAL, '--mobile-bg': `url(${mobileBgUrl})` }
    : { backgroundImage: `url(${bgUrl})`, '--mobile-bg': `url(${mobileBgUrl})` }

  function goHome() {
    if (loopConfig) return
    stopWelcomeAudio()
    setWelcomeHold(false)
    setEntered(false)
    setAvatarState('intro')
  }

  function handleChatSpeakingChange(on) {
    if (loopConfig) return
    stopWelcomeAudio()
    setWelcomeHold(false)
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
              holdIntro={welcomeHold}
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
