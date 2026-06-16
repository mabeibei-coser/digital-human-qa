import { useEffect, useRef, useState } from 'react'

// 数字人三段视频状态，资产放在 public/avatar/（见该目录 README）
const CLIPS = {
  idle: { src: 'avatar/idle.webm', loop: true, label: '待命中' },
  intro: { src: 'avatar/intro.webm', loop: false, label: '欢迎介绍' },
  speaking: { src: 'avatar/speaking.webm', loop: true, label: '正在回答' },
}

export default function VideoAvatar({ state = 'idle', onIntroEnd }) {
  const clip = CLIPS[state] ?? CLIPS.idle
  const videoRef = useRef(null)
  const [failed, setFailed] = useState(false)

  // 切换状态时重置加载失败标记，并从头播放
  useEffect(() => {
    setFailed(false)
    const v = videoRef.current
    if (v) {
      v.currentTime = 0
      v.play().catch(() => {})
    }
  }, [state])

  // 用 BASE_URL 拼路径，子路径部署（/a900/）下视频才不会 404
  const src = import.meta.env.BASE_URL + clip.src

  return (
    <div className="avatar-stage">
      {!failed ? (
        <video
          ref={videoRef}
          className="avatar-video"
          src={src}
          autoPlay
          muted
          playsInline
          loop={clip.loop}
          onError={() => setFailed(true)}
          onEnded={() => {
            if (!clip.loop) onIntroEnd?.()
          }}
        />
      ) : (
        <div className="avatar-placeholder">
          <div className="avatar-placeholder__figure">🧑‍💼</div>
          <p className="avatar-placeholder__hint">
            数字人视频待接入
            <br />
            <span>把 {clip.src.split('/').pop()} 放进 public/avatar/</span>
          </p>
        </div>
      )}
      <span className="avatar-state-badge">{clip.label}</span>
    </div>
  )
}
