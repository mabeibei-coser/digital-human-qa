import { useCallback, useEffect, useRef, useState } from 'react'
import { NO_ALPHA } from '../noAlpha.js'
import { AVATARS } from '../avatars.js'

// 三态视频数字人：idle/speaking 静音循环常驻（crossfade）；intro 进场播一次。
// 全部「静音自动播」打底——iOS/微信只允许静音视频自动播，这样各端都一定能显示画面。
// 欢迎语音：加载后尝试解除静音（桌面/启动器允许时成功）+ 首次触摸解锁（iOS）。
const inlineAttrs = { 'webkit-playsinline': 'true', 'x5-playsinline': 'true' }
const V = '18' // v18: re-exported clips with clean white background (old ones had black edges).

// Use the same MP4 clips everywhere; the supplied source clips were HEVC,
// so these project assets are browser-safe H.264 transcodes on a pure-white (#fff) studio matte.
const EXT = '.fallback.mp4'

// 三态固定元数据（哪态循环）；每态实际加载的视频文件名来自所选形象（见 ../avatars.js）。
const CLIPS = [
  { key: 'idle', loop: true },
  { key: 'intro', loop: false },
  { key: 'speaking', loop: true },
]

export default function VideoAvatar({ state = 'intro', onIntroEnd, autoUnlock = false, variant = 'default' }) {
  const { dir, files } = AVATARS[variant] || AVATARS.default
  const idleRef = useRef(null)
  const introRef = useRef(null)
  const speakingRef = useRef(null)
  const refs = { idle: idleRef, intro: introRef, speaking: speakingRef }
  const [failed, setFailed] = useState({})
  const [introMuted, setIntroMuted] = useState(true) // intro 初始静音→各端都能自动播+显示
  // 切换时把「上一个状态」的视频垫在底层并保持不透明，新视频在它之上淡入，
  // 避免对称 crossfade 中途两个人物都半透明 → 人物变淡/露底色「白闪」。
  const [prevState, setPrevState] = useState(null)
  const prevStateRef = useRef(state)
  const armedRef = useRef(false)
  const base = import.meta.env.BASE_URL + dir

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

  // 状态切换：非 intro 态暂停 intro（停欢迎语音）；目标态视频从「当前帧」续播 + 淡入。
  // ⚠️ 不再 reset currentTime=0：idle/speaking 是常驻循环视频，一直在后台播着、画面是好的。
  // 强行倒带到 0 会触发透明 webm 重新解码首帧、alpha 通道短暂失效，crossfade 时露出「白闪」。
  // 从当前帧续播则目标层始终有正常画面，淡入即平滑。
  useEffect(() => {
    const intro = introRef.current
    if (state === 'intro') {
      if (intro && intro.paused && !intro.ended) intro.play().catch(() => {})
    } else {
      if (intro) intro.pause()
      const active = refs[state]?.current
      if (active && active.paused) active.play().catch(() => {})
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state])

  // 记录上一个状态：过渡期间它垫底（不透明）托住人物，过渡结束（略长于 220ms 淡入）后撤掉
  useEffect(() => {
    if (prevStateRef.current === state) return
    setPrevState(prevStateRef.current)
    prevStateRef.current = state
    const t = setTimeout(() => setPrevState(null), 300)
    return () => clearTimeout(t)
  }, [state])

  const allFailed = CLIPS.every((c) => failed[c.key])

  return (
    <div className="avatar">
      {CLIPS.map((c) => (
        <video
          key={c.key}
          ref={refs[c.key]}
          className={
            'avatar__clip' +
            (state === c.key ? ' is-shown' : prevState === c.key ? ' is-prev' : '')
          }
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
