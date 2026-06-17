import { useCallback, useEffect, useRef, useState } from 'react'
import { NO_ALPHA } from '../noAlpha.js'

// 三态视频数字人：idle/speaking 静音循环常驻（crossfade）；intro 进场播一次。
// 全部「静音自动播」打底——iOS/微信只允许静音视频自动播，这样各端都一定能显示画面。
// 欢迎语音：加载后尝试解除静音（桌面/启动器允许时成功）+ 首次触摸解锁（iOS）。
const inlineAttrs = { 'webkit-playsinline': 'true', 'x5-playsinline': 'true' }
const V = '10' // 视频缓存版本号

// iOS/微信不支持透明 WebM → 用不透明 mp4（纯色底，与页面背景同色，无拼接缝）；桌面/安卓 Chrome 用透明 webm。
const EXT = NO_ALPHA ? '.fallback.mp4' : '.webm'

const CLIPS = [
  { key: 'idle', file: 'idle', loop: true },
  { key: 'intro', file: 'intro', loop: false },
  { key: 'speaking', file: 'speaking', loop: true },
]

export default function VideoAvatar({ state = 'intro', onIntroEnd, autoUnlock = false }) {
  const idleRef = useRef(null)
  const introRef = useRef(null)
  const speakingRef = useRef(null)
  const refs = { idle: idleRef, intro: introRef, speaking: speakingRef }
  const [failed, setFailed] = useState({})
  const [introMuted, setIntroMuted] = useState(true) // intro 初始静音→各端都能自动播+显示
  const armedRef = useRef(false)
  const base = import.meta.env.BASE_URL + 'avatar/'

  // 首次交互：解除 intro 静音（若还在播），让欢迎语音出声。只解静音、不重播、不改状态。
  const armUnlock = useCallback(() => {
    if (armedRef.current) return
    armedRef.current = true
    const events = ['pointerdown', 'keydown', 'touchend', 'click']
    const unlock = () => {
      // 播放所有视频（覆盖 iOS 省电模式对自动播放的拦截）
      ;[idleRef.current, speakingRef.current].forEach((v) => { if (v) v.play().catch(() => {}) })
      const intro = introRef.current
      if (intro) {
        if (intro.muted && !intro.ended) { intro.muted = false; setIntroMuted(false) }
        intro.play().catch(() => {})
      }
      events.forEach((e) => window.removeEventListener(e, unlock))
    }
    events.forEach((e) => window.addEventListener(e, unlock))
  }, [])

  // 挂载：全部静音自动播（确保 iOS 也显示画面）；intro 再尝试有声（桌面/kiosk 成功，iOS 失败回静音 + 等手势）
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
      intro.muted = true
      intro.play().catch(() => {}) // 先静音播起来（能放就放）
      // 桌面历来允许有声自动播；autoUnlock=从前序页一次真实手势进来（含 iOS/微信），
      // 借这次 user activation 直接有声播欢迎语，不用再点一次。失败仍由 armUnlock 兜底。
      if (!NO_ALPHA || autoUnlock) {
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
    armUnlock() // 始终挂首次触摸兜底：覆盖 iOS 省电模式（禁自动播）+ 给欢迎语音
  }, [armUnlock, autoUnlock])

  // 状态切换：非 intro 态暂停 intro（停欢迎语音）并从头播当前态视频；intro 的播放由挂载 effect 管
  useEffect(() => {
    const intro = introRef.current
    if (state === 'intro') {
      if (intro && intro.paused && !intro.ended) intro.play().catch(() => {})
    } else {
      if (intro) intro.pause()
      const active = refs[state]?.current
      if (active) {
        try { active.currentTime = 0 } catch (e) { /* ignore */ }
        active.play().catch(() => {})
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state])

  const allFailed = CLIPS.every((c) => failed[c.key])

  return (
    <div className="avatar">
      {CLIPS.map((c) => (
        <video
          key={c.key}
          ref={refs[c.key]}
          className={'avatar__clip' + (state === c.key ? ' is-shown' : '')}
          src={base + c.file + EXT + '?v=' + V}
          poster={base + 'poster.jpg?v=' + V}
          muted={c.key === 'intro' ? introMuted : true}
          autoPlay
          playsInline
          loop={c.loop}
          preload="auto"
          aria-hidden="true"
          onError={() => setFailed((f) => ({ ...f, [c.key]: true }))}
          onEnded={() => {
            if (c.key === 'intro') onIntroEnd?.()
          }}
          {...inlineAttrs}
        />
      ))}
      {allFailed && (
        <div className="avatar__placeholder">
          <div className="avatar__ph-figure">🧑‍💼</div>
          <p>数字人加载中…</p>
        </div>
      )}
    </div>
  )
}
