import { useCallback, useEffect, useRef, useState } from 'react'

// 三态透明视频数字人：idle/speaking 静音循环常驻（crossfade，零黑帧）；
// intro 带欢迎语音、只在 intro 态播一次，离开 intro 态立即暂停（停欢迎语音，防与回答 TTS 重叠）。
const inlineAttrs = { 'webkit-playsinline': 'true', 'x5-playsinline': 'true' }
const V = '7' // 视频缓存版本号：换视频/换格式后 +1

// iOS / 微信不支持透明 WebM 的 alpha（会把原始白底显示出来）→ 用烤了页面背景的不透明 mp4；
// 桌面 Chrome / 安卓用透明 webm（页面背景从人物边缘透出，更精致）。
const UA = typeof navigator !== 'undefined' ? navigator.userAgent || '' : ''
const NO_ALPHA =
  /iP(hone|ad|od)/.test(UA) ||
  /MicroMessenger/i.test(UA) ||
  (typeof navigator !== 'undefined' && navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
const EXT = NO_ALPHA ? '.fallback.mp4' : '.webm'

const CLIPS = [
  { key: 'idle', file: 'idle', loop: true },
  { key: 'intro', file: 'intro', loop: false },
  { key: 'speaking', file: 'speaking', loop: true },
]

export default function VideoAvatar({ state = 'intro', onIntroEnd }) {
  const idleRef = useRef(null)
  const introRef = useRef(null)
  const speakingRef = useRef(null)
  const refs = { idle: idleRef, intro: introRef, speaking: speakingRef }
  const [failed, setFailed] = useState({})
  const armedRef = useRef(false)
  const base = import.meta.env.BASE_URL + 'avatar/'

  // 首次交互解锁：若欢迎仍在播且被静音，则解除静音让欢迎语音接着出声。
  // 只解除静音，不重播、不改状态——避免和「提问→回答 TTS」撞车出现重复欢迎语。
  const armUnlockOnce = useCallback(() => {
    if (armedRef.current) return
    armedRef.current = true
    const events = ['pointerdown', 'keydown', 'touchend', 'click']
    const unlock = () => {
      const intro = introRef.current
      if (intro && intro.muted && !intro.ended && !intro.paused) {
        intro.muted = false
        intro.play().catch(() => {})
      }
      events.forEach((e) => window.removeEventListener(e, unlock))
    }
    events.forEach((e) => window.addEventListener(e, unlock))
  }, [])

  // idle / speaking：静音循环常驻
  useEffect(() => {
    ;[idleRef.current, speakingRef.current].forEach((v) => {
      if (v) {
        v.muted = true
        v.play().catch(() => {})
      }
    })
  }, [])

  // 状态切换：intro 态从头播欢迎（带声，被拦则静音+等首次交互解锁）；
  // 非 intro 态则暂停 intro（停欢迎语音），并从头播当前态视频。
  useEffect(() => {
    const intro = introRef.current
    if (state === 'intro') {
      if (intro) {
        try { intro.currentTime = 0 } catch (e) { /* ignore */ }
        intro.muted = false
        intro.play().catch(() => {
          intro.muted = true
          intro.play().catch(() => {})
          armUnlockOnce()
        })
      }
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
          muted={c.key !== 'intro'}
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
