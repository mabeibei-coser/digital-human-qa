import { useCallback, useEffect, useRef, useState } from 'react'
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

export default function VideoAvatar({ state = 'intro', onIntroEnd, variant = 'default', holdIntro = false }) {
  const { dir, files } = AVATARS[variant] || AVATARS.default
  const idleRef = useRef(null)
  const introRef = useRef(null)
  const speakingRef = useRef(null)
  const refs = { idle: idleRef, intro: introRef, speaking: speakingRef }
  const [failed, setFailed] = useState({})
  const [shownState, setShownState] = useState(state)
  const [prevState, setPrevState] = useState(null)
  const shownStateRef = useRef(state)
  const transitionTokenRef = useRef(0)
  const prevClearRef = useRef(null)
  const armedRef = useRef(false)
  const watchTimeRef = useRef(null)
  const watchStallRef = useRef(0)
  const base = import.meta.env.BASE_URL + dir

  const armUnlock = useCallback(() => {
    if (armedRef.current) return
    armedRef.current = true
    const events = ['pointerdown', 'keydown', 'touchend', 'click']
    const unlock = () => {
      // 只解锁「当前显示」那一路，别一次性把 3 路都拉起来（安卓硬解器扛不住）
      const map = { idle: idleRef.current, intro: introRef.current, speaking: speakingRef.current }
      const v = map[shownStateRef.current]
      if (v) {
        v.muted = true
        v.play().catch(() => {})
      }
      events.forEach((e) => window.removeEventListener(e, unlock))
    }
    events.forEach((e) => window.addEventListener(e, unlock))
  }, [])

  useEffect(() => {
    const idle = idleRef.current
    const speak = speakingRef.current
    const intro = introRef.current

    ;[idle, intro, speak].forEach((v) => {
      if (!v) return
      v.muted = true
      if (v === intro && holdIntro) return // 冻结期：intro 停在首帧，等编排统一起播
      v.play().catch(() => {})
    })

    armUnlock()
    // holdIntro 只取挂载那一刻的值即可（进入时与 variant 一同 flushSync 设好）
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [armUnlock])

  useEffect(() => {
    const intro = introRef.current
    if (!intro) return

    if (holdIntro) {
      if (!intro.paused) intro.pause() // 冻结期不抢着播，交给 App 的起播编排统一开
      return
    }

    if (state === 'intro' || shownState === 'intro' || prevState === 'intro') {
      if (intro.paused && !intro.ended) intro.play().catch(() => {})
    } else if (!intro.paused) {
      intro.pause()
    }
  }, [state, shownState, prevState, holdIntro])

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
        // intro 与 idle 切入时都从第 0 帧（中性姿态）起：crossfade 混合的两帧才同位，
        // 否则 idle 从循环里随机一帧淡入，会和上一段叠出「双重脸」重影 → 衔接处闪一下。
        ready = await ensureDrawable(targetVideo, { reset: (state === 'intro' || state === 'idle') && attempt === 0 })
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

  // 安卓硬解器同时只扛得住有限路视频，3 路一起解会卡死/断音。
  // 只保留「当前显示 / 过渡上一帧 / 即将切入的目标」在播，其余暂停，多数时刻只 1 路在解。
  useEffect(() => {
    const active = new Set([state, shownState, prevState])
    ;['idle', 'intro', 'speaking'].forEach((key) => {
      if (active.has(key)) return
      const v = refs[key]?.current
      if (v && !v.paused) v.pause()
    })
    // refs 是稳定的 React ref
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state, shownState, prevState])

  // 看门狗：安卓/微信 X5 会让待机循环视频停掉（loop 没重启 / 省电暂停 / 解码器被回收），
  // 表现就是「待机卡死、画面不动」。每 1.2s 检查「当前显示的循环态(idle/speaking)」是否还在前进，
  // 卡住就续播；连续卡住就 load() 硬重载兜底。只看显示中的循环态，不动 intro(一次性)与冻结期。
  useEffect(() => {
    const LOOPERS = new Set(['idle', 'speaking'])
    const tick = () => {
      const key = shownStateRef.current
      if (holdIntro || !LOOPERS.has(key)) {
        watchTimeRef.current = null
        watchStallRef.current = 0
        return
      }
      const v = refs[key]?.current
      if (!v || !v.videoWidth) return
      const t = v.currentTime
      const last = watchTimeRef.current
      watchTimeRef.current = t
      const stalled = v.paused || v.ended || (last != null && Math.abs(t - last) < 0.05)
      if (!stalled) {
        watchStallRef.current = 0
        return
      }
      watchStallRef.current += 1
      try {
        if (v.ended || (v.duration && t >= v.duration - 0.3)) v.currentTime = 0
      } catch {
        /* ignore */
      }
      if (watchStallRef.current >= 2) {
        try {
          v.load() // 连续卡住：硬重载，兜底解码器被系统回收
        } catch {
          /* ignore */
        }
        watchStallRef.current = 0
      }
      v.play().catch(() => {})
    }
    const id = window.setInterval(tick, 1200)
    return () => window.clearInterval(id)
    // refs/shownStateRef 稳定；只需在冻结态切换时重置
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [holdIntro])

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
          muted
          autoPlay={c.key === 'intro' ? !holdIntro : true}
          playsInline
          loop={c.loop}
          preload="auto"
          aria-hidden="true"
          onError={() => setFailed((f) => ({ ...f, [c.key]: true }))}
          onEnded={() => {
            if (c.key === 'intro' && shownStateRef.current === 'intro') {
              onIntroEnd?.()
              return
            }
            // 安卓/微信 X5 的 native loop 偶尔到结尾不自动重启 → 手动兜底，避免待机冻住
            if (c.loop) {
              const v = refs[c.key]?.current
              if (v) {
                try {
                  v.currentTime = 0
                } catch {
                  /* ignore */
                }
                v.play().catch(() => {})
              }
            }
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
