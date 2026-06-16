import { useEffect, useRef, useState } from 'react'

const WELCOME =
  '您好！我是创业服务智能助手，创业扶持政策、开办流程、补贴申领、担保贷款等问题都可以问我。'

const SUGGESTIONS = [
  { key: 'loan', label: '创业担保贷款怎么申请？', short: '创业担保贷款', icon: 'bank' },
  { key: 'subsidy', label: '一次性创业补贴怎么领？', short: '一次性创业补贴', icon: 'yen' },
]

// 子路径部署安全：BASE 在 dev 是 '/'、生产是 '/a900/'
const BASE = import.meta.env.BASE_URL

function Icon({ name }) {
  switch (name) {
    case 'bot':
      return (
        <svg viewBox="0 0 24 24" width="60%" height="60%" fill="none" aria-hidden="true">
          <rect x="4" y="8" width="16" height="11" rx="4" fill="currentColor" />
          <circle cx="9.5" cy="13.5" r="1.6" fill="#fff" />
          <circle cx="14.5" cy="13.5" r="1.6" fill="#fff" />
          <path d="M12 3.5v3.2" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
          <circle cx="12" cy="3" r="1.5" fill="currentColor" />
        </svg>
      )
    case 'bank':
      return (
        <svg viewBox="0 0 24 24" width="56%" height="56%" fill="none" stroke="currentColor"
          strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M3 9l9-5 9 5" />
          <path d="M5 9v8M9.5 9v8M14.5 9v8M19 9v8" />
          <path d="M3 20h18" />
        </svg>
      )
    case 'yen':
      return (
        <svg viewBox="0 0 24 24" width="56%" height="56%" fill="none" stroke="currentColor"
          strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M7 5l5 6.5L17 5" />
          <path d="M12 11.5V19" />
          <path d="M8.2 14h7.6M8.2 16.6h7.6" />
        </svg>
      )
    case 'send':
      return (
        <svg viewBox="0 0 24 24" width="48%" height="48%" fill="currentColor" aria-hidden="true">
          <path d="M3.2 20.6l18-8.2a1 1 0 000-1.8l-18-8.2a.7.7 0 00-1 .82L4.7 10.4 14 11.5l-9.3 1.1-2.5 7.2a.7.7 0 001 .8z" />
        </svg>
      )
    default:
      return null
  }
}

export default function ChatPanel({ onSpeakingChange }) {
  const [messages, setMessages] = useState([{ role: 'assistant', text: WELCOME }])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const listRef = useRef(null)
  const audioRef = useRef(null)

  // TTS 流水线：句子队列 + 顺序播放 + 边播边合成下一句
  const queueRef = useRef([]) // 待合成的句子
  const streamDoneRef = useRef(true) // LLM 流是否结束
  const workerRef = useRef(false) // 播放/合成 worker 是否在跑

  useEffect(() => {
    const el = listRef.current
    if (el) el.scrollTop = el.scrollHeight
  }, [messages, loading])

  async function synthOne(text) {
    try {
      const r = await fetch(`${BASE}api/tts`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text }),
      })
      const d = await r.json()
      return d.audio || ''
    } catch (e) {
      return ''
    }
  }

  function playOne(b64) {
    return new Promise((resolve) => {
      const a = audioRef.current
      if (!a) return resolve()
      a.src = `data:audio/mp3;base64,${b64}`
      a.onended = resolve
      a.onerror = resolve
      a.play().catch(() => resolve())
    })
  }

  // worker：从句子队列取句 → 合成 → 播放；播当前句时预合成下一句，减少句间停顿
  async function runWorker() {
    if (workerRef.current) return
    workerRef.current = true
    let nextSynth = null
    let started = false // 等首段语音「真正开始播放」时才切说话态（而非文字出现时）
    while (true) {
      let b64 = null
      if (nextSynth) {
        b64 = await nextSynth
        nextSynth = null
      } else if (queueRef.current.length) {
        b64 = await synthOne(queueRef.current.shift())
      } else if (!streamDoneRef.current) {
        await new Promise((r) => setTimeout(r, 60)) // 等更多句子
        continue
      } else {
        break // 队列空 + 流结束
      }
      if (queueRef.current.length) nextSynth = synthOne(queueRef.current.shift())
      if (b64) {
        if (!started) {
          started = true
          onSpeakingChange?.(true) // 语音开始播放的同时，数字人切「说话」
        }
        await playOne(b64)
      }
    }
    workerRef.current = false
    if (started) onSpeakingChange?.(false)
  }

  function enqueue(sentence) {
    const t = sentence.trim()
    if (!t) return
    queueRef.current.push(t)
    runWorker()
  }

  async function send(text) {
    const q = (text ?? input).trim()
    if (!q || loading) return
    onSpeakingChange?.(false) // 退出欢迎态、停欢迎语音
    const history = messages.map((m) => ({ role: m.role, content: m.text }))
    setMessages((m) => [...m, { role: 'user', text: q }, { role: 'assistant', text: '' }])
    setInput('')
    setLoading(true)

    // 重置 TTS 流水线
    queueRef.current = []
    streamDoneRef.current = false
    let answer = ''
    let pending = '' // 还没凑成整句的尾巴
    const updateLast = (txt) =>
      setMessages((m) => {
        const c = m.slice()
        c[c.length - 1] = { role: 'assistant', text: txt }
        return c
      })
    function feed(delta) {
      answer += delta
      updateLast(answer)
      pending += delta
      // 优先按句末标点切句送 TTS；句子太长时（>=20字）也按逗号/顿号切一小段先念，让数字人更快开口
      while (true) {
        let m = pending.search(/[。！？!?\n]/)
        if (m === -1 && pending.length >= 20) {
          const c = pending.search(/[，、；,;]/)
          if (c >= 6) m = c
        }
        if (m === -1) break
        enqueue(pending.slice(0, m + 1))
        pending = pending.slice(m + 1)
      }
    }

    let errored = false
    try {
      const r = await fetch(`${BASE}api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question: q, history }),
      })
      if (!r.ok || !r.body) throw new Error('no stream')
      const reader = r.body.getReader()
      const dec = new TextDecoder()
      let buf = ''
      while (true) {
        const { value, done } = await reader.read()
        if (done) break
        buf += dec.decode(value, { stream: true })
        let i
        while ((i = buf.indexOf('\n')) !== -1) {
          const line = buf.slice(0, i).trim()
          buf = buf.slice(i + 1)
          if (!line.startsWith('data:')) continue
          const data = line.slice(5).trim()
          if (data === '[DONE]') continue
          try {
            const j = JSON.parse(data)
            if (j.delta) feed(j.delta)
            else if (j.error) {
              errored = true
              updateLast(j.error)
            }
          } catch (e) {
            /* ignore */
          }
        }
      }
      if (pending.trim()) enqueue(pending) // 最后不足一句的尾巴也念出来
      if (!answer && !errored) updateLast('抱歉，我这会儿有点忙，请稍后再问我一次。')
    } catch (e) {
      updateLast('抱歉，网络好像有点问题，请稍后再试。')
    } finally {
      streamDoneRef.current = true
      setLoading(false)
      runWorker() // 兜底：确保队列被处理干净
    }
  }

  return (
    <div className="chat">
      <header className="chat__head">
        <div className="chat__brand">
          <span className="chat__logo">
            <Icon name="bot" />
          </span>
          <div className="chat__titles">
            <h1>创业服务智能助手</h1>
            <p>创业政策咨询 · 创业问答</p>
          </div>
        </div>
        <span className="chat__online">
          <i className="chat__dot" />
          ONLINE
        </span>
      </header>

      <div className="chat__messages" ref={listRef}>
        {messages.map((m, i) => (
          <div key={i} className={'msg msg--' + (m.role === 'assistant' ? 'bot' : 'user')}>
            {m.role === 'assistant' && (
              <span className="msg__avatar">
                <Icon name="bot" />
              </span>
            )}
            <div className="msg__bubble">
              {m.text || (m.role === 'assistant' && loading && i === messages.length - 1 ? (
                <span className="msg__typing">
                  <span />
                  <span />
                  <span />
                </span>
              ) : (
                m.text
              ))}
            </div>
          </div>
        ))}
      </div>

      <div className="chat__suggest">
        {SUGGESTIONS.map((s) => (
          <button key={s.key} className="sg" onClick={() => send(s.label)} disabled={loading}>
            <span className="sg__icon">
              <Icon name={s.icon} />
            </span>
            <span className="sg__label">{s.short}</span>
          </button>
        ))}
      </div>

      <div className="chat__inputbar">
        <input
          className="chat__input"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && send()}
          placeholder="请输入你的创业政策问题…"
          disabled={loading}
        />
        <button className="chat__send" onClick={() => send()} aria-label="发送" disabled={loading}>
          <Icon name="send" />
        </button>
      </div>

      <audio ref={audioRef} hidden />
    </div>
  )
}
