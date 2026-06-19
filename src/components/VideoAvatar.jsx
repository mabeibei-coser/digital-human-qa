import { useCallback, useEffect, useRef, useState } from 'react'
import { NO_ALPHA } from '../noAlpha.js'
import { AVATARS } from '../avatars.js'

const inlineAttrs = { 'webkit-playsinline': 'true', 'x5-playsinline': 'true' }
const V = '28'
const EXT = '.fallback.mp4'
const DRAWABLE_TIMEOUT_MS = 1400

const CLIPS = [
  { key: 'idle', loop: true },
  { key: 'intro', loop: false },
  { key: 'speaking', loop: true },
]

const CALIBRATION = {
  default: {
    idle: { scale: 1, x: 0, y: 0 },
    intro: { scale: 1, x: 0, y: 0 },
    speaking: { scale: 1, x: 0, y: 0 },
  },
  sim: {
    idle: { scale: 1, x: 0, y: 0 },
    intro: { scale: 1, x: 0, y: 0 },
    speaking: { scale: 1, x: 0, y: 0 },
  },
}

function waitForVideoEvent(video, names, timeoutMs) {
  return new Promise((resolve) => {
    let done = false
    const finish = () => {
      if (done) return
      done = true
      names.forEach((name) => video.removeEventListener(name, finish))
      clearTimeout(timer)
      resolve()
    }
    const timer = setTimeout(finish, timeoutMs)
    names.forEach((name) => video.addEventListener(name, finish, { once: true }))
  })
}

function waitForPaintedVideoFrame(video) {
  return new Promise((resolve) => {
    if (!video) {
      resolve(false)
      return
    }
    if ('requestVideoFrameCallback' in video) {
      const id = video.requestVideoFrameCallback(() => resolve(true))
      setTimeout(() => {
        if ('cancelVideoFrameCallback' in video) video.cancelVideoFrameCallback(id)
        resolve(true)
      }, 180)
      return
    }
    requestAnimationFrame(() => resolve(true))
  })
}

async function ensureDrawable(video, { reset = false } = {}) {
  if (!video) return false

  if (reset) {
    try {
      video.pause()
      if (Math.abs(video.currentTime) > 0.03) {
        video.currentTime = 0
        await waitForVideoEvent(video, ['seeked', 'loadeddata', 'canplay'], DRAWABLE_TIMEOUT_MS)
      }
    } catch {
      // Mobile browsers can reject early seeks before metadata; the readiness wait below covers it.
    }
  }

  const playPromise = video.play()
  if (playPromise && typeof playPromise.catch === 'function') {
    await playPromise.catch(() => {})
  }

  if (video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA || !video.videoWidth || !video.videoHeight) {
    await waitForVideoEvent(video, ['loadeddata', 'canplay', 'timeupdate'], DRAWABLE_TIMEOUT_MS)
  }

  await waitForPaintedVideoFrame(video)
  return video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA && video.videoWidth > 0 && video.videoHeight > 0
}

export default function VideoAvatar({ state = 'intro', onIntroEnd, autoUnlock = false, variant = 'default' }) {
  const { dir, files } = AVATARS[variant] || AVATARS.default
  const idleRef = useRef(null)
  const introRef = useRef(null)
  const speakingRef = useRef(null)
  const refs = { idle: idleRef, intro: introRef, speaking: speakingRef }
  const [failed, setFailed] = useState({})
  const [introMuted, setIntroMuted] = useState(true)
  const [shownState, setShownState] = useState(state)
  const [prevState, setPrevState] = useState(null)
  const shownStateRef = useRef(state)
  const transitionTokenRef = useRef(0)
  const prevClearRef = useRef(null)
  const armedRef = useRef(false)
  const base = import.meta.env.BASE_URL + dir

  const armUnlock = useCallback(() => {
    if (armedRef.current) return
    armedRef.current = true
    const events = ['pointerdown', 'keydown', 'touchend', 'click']
    const unlock = () => {
      ;[idleRef.current, speakingRef.current].forEach((v) => {
        if (v) v.play().catch(() => {})
      })
      const intro = introRef.current
      if (intro) {
        if (intro.muted && !intro.ended) {
          intro.muted = false
          setIntroMuted(false)
        }
        intro.play().catch(() => {})
      }
      events.forEach((e) => window.removeEventListener(e, unlock))
    }
    events.forEach((e) => window.addEventListener(e, unlock))
  }, [])

  useEffect(() => {
    const idle = idleRef.current
    const speak = speakingRef.current
    const intro = introRef.current

    ;[idle, speak].forEach((v) => {
      if (v) {
        v.muted = true
        v.play().catch(() => {})
      }
    })

    if (intro) {
      if (intro.dataset.a900GestureUnlocked === 'true') {
        intro.muted = false
        intro
          .play()
          .then(() => setIntroMuted(false))
          .catch(() => {
            intro.muted = true
            setIntroMuted(true)
            intro.play().catch(() => {})
          })
      } else {
        intro.muted = true
        intro.play().catch(() => {})
      }

      if (intro.dataset.a900GestureUnlocked !== 'true' && (!NO_ALPHA || autoUnlock)) {
        intro.muted = false
        intro
          .play()
          .then(() => setIntroMuted(false))
          .catch(() => {
            intro.muted = true
            setIntroMuted(true)
            intro.play().catch(() => {})
          })
      }
    }

    armUnlock()
  }, [armUnlock, autoUnlock])

  useEffect(() => {
    const intro = introRef.current
    if (!intro) return

    if (state === 'intro' || shownState === 'intro' || prevState === 'intro') {
      if (intro.paused && !intro.ended) intro.play().catch(() => {})
    } else if (!intro.paused) {
      intro.pause()
    }
  }, [state, shownState, prevState])

  useEffect(() => {
    const current = shownStateRef.current
    if (current === state) return

    let cancelled = false
    const token = transitionTokenRef.current + 1
    transitionTokenRef.current = token
    const targetVideo = refs[state]?.current

    ;(async () => {
      let ready = false
      for (let attempt = 0; attempt < 4 && !ready; attempt += 1) {
        ready = await ensureDrawable(targetVideo, { reset: state === 'intro' && attempt === 0 })
        if (!ready && targetVideo) {
          try {
            targetVideo.load()
          } catch {
            // Keep the previous visible layer if the browser refuses to refresh this target.
          }
          await new Promise((resolve) => setTimeout(resolve, 120))
        }
      }
      if (cancelled || transitionTokenRef.current !== token) return
      if (!ready) return

      const prev = shownStateRef.current
      setPrevState(prev)
      shownStateRef.current = state
      setShownState(state)

      if (prevClearRef.current) clearTimeout(prevClearRef.current)
      const holdMs = variant === 'sim' && prev === 'speaking' && state === 'idle' ? 980 : variant === 'sim' ? 620 : 340
      prevClearRef.current = setTimeout(() => {
        setPrevState(null)
        prevClearRef.current = null
      }, holdMs)
    })()

    return () => {
      cancelled = true
    }
    // refs are stable React refs; this effect intentionally follows the requested state.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state, variant])

  useEffect(() => {
    return () => {
      if (prevClearRef.current) clearTimeout(prevClearRef.current)
    }
  }, [])

  const allFailed = CLIPS.every((c) => failed[c.key])
  const simSpeakingToIdle = variant === 'sim' && prevState === 'speaking' && shownState === 'idle'

  return (
    <div
      className={'avatar avatar--' + variant}
      data-avatar-target={state}
      data-avatar-shown={shownState}
      data-avatar-ready={state === shownState ? 'true' : 'pending'}
    >
      {CLIPS.map((c) => (
        <video
          key={c.key}
          ref={refs[c.key]}
          className={
            'avatar__clip avatar__clip--' + c.key +
            (shownState === c.key ? ' is-shown' : prevState === c.key ? ' is-prev' : '') +
            (simSpeakingToIdle && c.key === 'idle' ? ' is-solid-target' : '') +
            (simSpeakingToIdle && c.key === 'speaking' ? ' is-leaving' : '')
          }
          style={{
            '--avatar-scale': CALIBRATION[variant]?.[c.key]?.scale ?? 1,
            '--avatar-x': `${CALIBRATION[variant]?.[c.key]?.x ?? 0}px`,
            '--avatar-y': `${CALIBRATION[variant]?.[c.key]?.y ?? 0}px`,
          }}
          src={base + files[c.key] + EXT + '?v=' + V}
          poster={base + 'poster.jpg?v=' + V}
          muted={c.key === 'intro' ? introMuted : true}
          autoPlay
          playsInline
          loop={c.loop}
          preload="auto"
          aria-hidden="true"
          onError={() => setFailed((f) => ({ ...f, [c.key]: true }))}
          onEnded={() => {
            if (c.key === 'intro' && shownStateRef.current === 'intro') onIntroEnd?.()
          }}
          {...inlineAttrs}
        />
      ))}
      {allFailed && (
        <div className="avatar__placeholder">
          <div className="avatar__ph-figure">AI</div>
          <p>数字人加载中...</p>
        </div>
      )}
    </div>
  )
}
