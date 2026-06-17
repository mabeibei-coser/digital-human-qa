import { useEffect, useRef, useState } from 'react'
import {
  Bot,
  ChevronRight,
  Flame,
  Gift,
  JapaneseYen,
  Landmark,
  MessageCircle,
  MessageCircleMore,
  Mic,
  Send,
  ShieldCheck,
  Store,
  UserRound,
} from 'lucide-react'

const DESKTOP_WELCOME =
  '您好！我是创业服务智能助手，创业扶持政策、开办流程、补贴申领、担保贷款等问题都可以问我。'
const MOBILE_WELCOME = '您好，我可以帮您查政策、看条件、理流程。'

const SUGGESTIONS = [
  { key: 'loan', label: '创业担保贷款怎么申请？', short: '创业担保贷款', hint: '最高可贷500万', icon: 'bank' },
  { key: 'subsidy', label: '一次性创业补贴怎么领？', short: '一次性创业补贴', hint: '最高可领10万元', icon: 'yen' },
  { key: 'process', label: '个体工商户开办流程是什么？', short: '办理流程', hint: '查看各类业务办理步骤', icon: 'doc' },
]

const MOBILE_PROMPTS = [
  { key: 'benefit', label: '我能领取什么补贴？', short: '我能领什么补贴', desc: '有哪些补贴可以申领', icon: 'gift' },
  { key: 'loan-rule', label: '创业担保贷款需要什么条件？', short: '担保贷款条件', desc: '我符合贷款条件吗', icon: 'shield' },
  { key: 'license', label: '开店办照流程是什么？', short: '开店办照流程', desc: '如何办理营业执照', icon: 'store' },
]

const HOT_ITEMS = [
  { key: 'subsidy', label: '一次性创业补贴', desc: '符合条件可申请一次性创业补贴', icon: 'yen' },
  { key: 'loan', label: '创业担保贷款', desc: '政府贴息担保，解决创业资金难题', icon: 'bank' },
  { key: 'social', label: '社保补贴咨询', desc: '了解社保补贴政策及申请条件', icon: 'user' },
]

// 子路径部署安全：BASE 在 dev 是 '/'、生产是 '/a900/'
const BASE = import.meta.env.BASE_URL

function isMobileViewport() {
  return typeof window !== 'undefined' && window.matchMedia('(max-width: 920px)').matches
}

function Icon({ name }) {
  const common = { size: '60%', strokeWidth: 2, 'aria-hidden': true }
  switch (name) {
    case 'bot':
      return <Bot {...common} />
    case 'bank':
      return <Landmark {...common} />
    case 'yen':
      return <JapaneseYen {...common} />
    case 'doc':
      return <MessageCircle {...common} />
    case 'chat-dots':
      return <MessageCircleMore {...common} />
    case 'gift':
      return <Gift {...common} />
    case 'shield':
      return <ShieldCheck {...common} />
    case 'store':
      return <Store {...common} />
    case 'user':
      return <UserRound {...common} />
    case 'fire':
      return <Flame {...common} />
    case 'mic':
      return <Mic {...common} />
    case 'chevron':
      return <ChevronRight {...common} />
    case 'send':
      return <Send size="52%" strokeWidth={2.2} aria-hidden="true" />
    default:
      return null
  }
}

export default function ChatPanel({ onSpeakingChange }) {
  const [messages, setMessages] = useState(() => [{
    role: 'assistant',
    text: isMobileViewport() ? MOBILE_WELCOME : DESKTOP_WELCOME,
  }])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [recording, setRecording] = useState(false) // 正在录音
  const [asrBusy, setAsrBusy] = useState(false) // 正在识别
  const isMobile = isMobileViewport()
  const listRef = useRef(null)
  const audioRef = useRef(null)

  // TTS 流水线：句子队列 + 顺序播放 + 边播边合成下一句
  const queueRef = useRef([]) // 待合成的句子
  const streamDoneRef = useRef(true) // LLM 流是否结束
  const workerRef = useRef(false) // 播放/合成 worker 是否在跑

  // 语音提问（录音 → ASR）
  const mrRef = useRef(null)
  const recChunksRef = useRef([])
  const micStreamRef = useRef(null)
  const recTimerRef = useRef(null)
  const audioPrimedRef = useRef(false) // 移动端音频是否已解锁

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

  // ── 语音提问：点麦克风开始录音，再点结束 → 转写 → 自动当作提问发出 ──
  function pickRecMime() {
    const cands = ['audio/webm;codecs=opus', 'audio/mp4', 'audio/webm']
    for (const m of cands) {
      if (typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported(m)) return m
    }
    return ''
  }

  async function startRec() {
    if (recording || asrBusy || loading) return
    primeAudio()
    onSpeakingChange?.(false) // 退出欢迎态、停欢迎语音
    let stream
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true })
    } catch (e) {
      setMessages((m) => [
        ...m,
        { role: 'assistant', text: '我暂时听不到声音，请允许浏览器使用麦克风，或直接打字提问我。' },
      ])
      return
    }
    micStreamRef.current = stream
    const mime = pickRecMime()
    const mr = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined)
    recChunksRef.current = []
    mr.ondataavailable = (e) => {
      if (e.data && e.data.size > 0) recChunksRef.current.push(e.data)
    }
    mr.onstop = () => transcribeRec(mr.mimeType || mime)
    mrRef.current = mr
    mr.start() // 不分片，stop 时一次性拿完整 Blob（避免部分手机分片丢 EBML 头）
    setRecording(true)
    recTimerRef.current = setTimeout(() => stopRec(), 30000) // 安全上限 30s 自动停
  }

  function stopRec() {
    clearTimeout(recTimerRef.current)
    const mr = mrRef.current
    if (mr && mr.state !== 'inactive') mr.stop() // 触发 onstop → transcribeRec
    setRecording(false)
  }

  async function transcribeRec(mime) {
    const stream = micStreamRef.current
    if (stream) stream.getTracks().forEach((t) => t.stop())
    micStreamRef.current = null
    const blob = new Blob(recChunksRef.current, { type: mime || 'audio/webm' })
    recChunksRef.current = []
    if (blob.size < 3000) return // 太短，当作没说话
    setAsrBusy(true)
    try {
      const r = await fetch(`${BASE}api/asr`, {
        method: 'POST',
        headers: { 'Content-Type': blob.type || 'audio/webm' },
        body: blob,
      })
      const d = await r.json()
      const text = (d.text || '').trim()
      if (text) send(text) // 识别成功 → 自动提问，数字人作答
    } catch (e) {
      /* 网络异常静默，用户可重试或打字 */
    } finally {
      setAsrBusy(false)
    }
  }

  // 移动端音频解锁：TTS 的 play() 在 LLM 流式返回后才发生，已不在点击手势内、会被手机浏览器拦静音。
  // 首次用户手势里先用一段静音「解锁」audio 元素，之后程序化 play() 才放得出声。
  function primeAudio() {
    if (audioPrimedRef.current) return
    const a = audioRef.current
    if (!a) return
    audioPrimedRef.current = true
    try {
      a.src = `${BASE}silent.mp3`
      const p = a.play()
      if (p && p.then) p.then(() => { a.pause(); a.currentTime = 0 }).catch(() => {})
    } catch (e) {
      /* ignore */
    }
  }

  async function send(text) {
    primeAudio()
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
    <div className={'chat' + (messages.length > 1 ? ' chat--active' : '')}>
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

      <div className="chat__body">
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
            <span className="sg__copy">
              <span className="sg__label">{s.short}</span>
              <span className="sg__hint">{s.hint}</span>
            </span>
          </button>
        ))}
      </div>

      <div className="mobile-ask-title">
        <span />
        <strong>
          <Icon name="chat-dots" />
          你可以先问我
        </strong>
        <span />
      </div>

      <div className="mobile-prompt-grid">
        {MOBILE_PROMPTS.map((item) => (
          <button
            key={item.key}
            className="mobile-prompt"
            onClick={() => send(item.label)}
            disabled={loading}
          >
            <span className="mobile-prompt__icon">
              <Icon name={item.icon} />
            </span>
            <span className="mobile-prompt__label">{item.short}</span>
            <small>{item.desc}</small>
          </button>
        ))}
      </div>

      <section className="mobile-hot">
        <header className="mobile-hot__head">
          <strong>
            <span className="mobile-hot__fire">
              <Icon name="fire" />
            </span>
            热门事项
          </strong>
          <button type="button" onClick={() => send('还有哪些创业服务可以咨询？')} disabled={loading}>
            更多服务
            <Icon name="chevron" />
          </button>
        </header>

        <div className="mobile-hot__list">
          {HOT_ITEMS.map((item) => (
            <button
              key={item.key}
              className="mobile-hot__item"
              type="button"
              onClick={() => send(item.label)}
              disabled={loading}
            >
              <span className="mobile-hot__icon">
                <Icon name={item.icon} />
              </span>
              <span className="mobile-hot__copy">
                <strong>{item.label}</strong>
                <small>{item.desc}</small>
              </span>
              <span className="mobile-hot__arrow">
                <Icon name="chevron" />
              </span>
            </button>
          ))}
        </div>
      </section>
      </div>

      <div className="chat__inputbar">
        <button
          type="button"
          className={'chat__inputbot' + (recording ? ' chat__inputbot--rec' : '')}
          onClick={recording ? stopRec : startRec}
          disabled={loading || asrBusy}
          aria-label={recording ? '结束录音' : '语音提问'}
        >
          <Icon name="mic" />
        </button>
        <input
          className="chat__input"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && send()}
          placeholder={
            recording
              ? '聆听中…再次点击麦克风结束'
              : asrBusy
                ? '正在识别…'
                : isMobile
                  ? '说说你的创业问题…'
                  : '请输入你的创业政策问题…'
          }
          disabled={loading || recording}
        />
        <button className="chat__send" onClick={() => send()} aria-label="发送" disabled={loading}>
          <Icon name="send" />
        </button>
      </div>

      <p className="mobile-footnote">
        <ShieldCheck size={13} strokeWidth={2} aria-hidden="true" />
        政策权威 · 信息安全 · 专业服务
      </p>
      <audio ref={audioRef} hidden />
    </div>
  )
}
