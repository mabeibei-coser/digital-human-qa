import { useEffect, useRef, useState } from 'react'
import {
  Bot,
  ChevronRight,
  Flame,
  Gift,
  Home,
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
import './chat-home-button.css'

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

// 把流式文本切成「已完结的整句」+「还没说完的尾巴」。
// 句末标点：。！？!?…（含其后的引号/括号），分号/逗号不切——切得越碎语音越断，整句更连贯。
function splitSentences(text) {
  const sentences = []
  const re = /[。！？!?…]+["'』」）)】]*/g
  let last = 0
  let m
  while ((m = re.exec(text)) !== null) {
    const end = m.index + m[0].length
    sentences.push(text.slice(last, end))
    last = end
  }
  return { sentences, rest: text.slice(last) }
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

  // TTS：边吐字边按「每满 2 句」合成播放（首段也要凑够 2 句再开口），避免一句一合成导致语音断断续续

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

    let answer = ''
    let errored = false
    const updateLast = (txt) =>
      setMessages((m) => {
        const c = m.slice()
        c[c.length - 1] = { role: 'assistant', text: txt }
        return c
      })

    // ── 流式语音：边吐字边按句合成播放 ──
    // 攒满 2 句才送一段去合成（首段也要凑够 2 句，否则一上来单句开口会断断续续）。
    // 合成与播放分离：每段一拿到就立刻发起合成，播放按入队顺序串行（边播当前段边合成下一段）。
    let pendingTts = '' // 已吐字、但还没送去合成的文本
    let speaking = false // 数字人是否已进入说话态
    let playChain = Promise.resolve() // 串行播放链，await 它即等全部语音播完
    const enqueueChunk = (chunk) => {
      const t = chunk.trim()
      if (!t) return
      const synthP = synthOne(t) // 立刻开始合成，与上一段的播放并行
      playChain = playChain.then(async () => {
        const b64 = await synthP
        if (!b64) return
        if (!speaking) {
          speaking = true
          onSpeakingChange?.(true) // 第一段开始播 → 数字人开口
        }
        await playOne(b64)
      })
    }

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
            if (j.delta) {
              answer += j.delta
              pendingTts += j.delta
              updateLast(answer)
              // 攒满 2 句就送这一段去合成（含首段）
              const { sentences, rest } = splitSentences(pendingTts)
              if (sentences.length >= 2) {
                enqueueChunk(sentences.join(''))
                pendingTts = rest
              }
            } else if (j.error) {
              errored = true
              updateLast(j.error)
            }
          } catch (e) {
            /* ignore */
          }
        }
      }
      if (!answer && !errored) {
        errored = true
        updateLast('抱歉，我这会儿有点忙，请稍后再问我一次。')
      }
    } catch (e) {
      errored = true
      updateLast('抱歉，网络好像有点问题，请稍后再试。')
    }

    // 收尾：把不足 2 句的剩余文本也合成播放；等队列全部播完再退出说话态。
    if (!errored) {
      const leftover = pendingTts.trim()
      if (leftover) enqueueChunk(leftover)
    }
    await playChain
    if (speaking) onSpeakingChange?.(false)
    // loading 保持到语音全部播完才解除：AI 说话期间锁住输入/麦克风/按钮，
    // 避免下一个问题打断当前语音、两段语音抢同一个 <audio> 导致串音和口型错位。
    setLoading(false)
  }

  // 返回主页：清空当前对话，回到欢迎页（你可以先问我 + 热门事项）。AI 作答中不打断。
  function resetToHome() {
    if (loading) return
    const a = audioRef.current
    if (a) {
      try { a.pause(); a.currentTime = 0 } catch (e) { /* ignore */ }
    }
    setInput('')
    setMessages([{ role: 'assistant', text: isMobileViewport() ? MOBILE_WELCOME : DESKTOP_WELCOME }])
    onSpeakingChange?.(false) // 数字人回到待命态
  }

  const active = messages.length > 1

  return (
    <div className={'chat' + (active ? ' chat--active' : '')}>
      <header className="chat__head">
        <div className="chat__brand">
          <span className="chat__logo">
            <Icon name="bot" />
          </span>
          <div className="chat__titles">
            <h1>创业服务智能助手</h1>
            <p>政策咨询 · 办事指引 · 申领测算</p>
          </div>
        </div>
        <span className="chat__online">
          <i className="chat__dot" />
          在线服务中
        </span>
      </header>

      <div className="desktop-service-home">
        <section className="desktop-ask" aria-labelledby="desktop-ask-title">
          <header className="desktop-section-head">
            <span className="desktop-section-head__icon">
              <Icon name="chat-dots" />
            </span>
            <h2 id="desktop-ask-title">你可以先问我</h2>
          </header>

          <div className="desktop-prompt-grid">
            {MOBILE_PROMPTS.map((item) => (
              <button
                key={item.key}
                className="desktop-prompt"
                type="button"
                onClick={() => send(item.label)}
                disabled={loading}
              >
                <span className="desktop-prompt__icon">
                  <Icon name={item.icon} />
                </span>
                <span className="desktop-prompt__copy">
                  <strong>{item.short}</strong>
                  <small>{item.desc}</small>
                </span>
                <span className="desktop-card-arrow">
                  <Icon name="chevron" />
                </span>
              </button>
            ))}
          </div>
        </section>

        <section className="desktop-hot" aria-labelledby="desktop-hot-title">
          <header className="desktop-hot__head">
            <div className="desktop-section-head">
              <span className="desktop-section-head__icon desktop-section-head__icon--hot">
                <Icon name="fire" />
              </span>
              <h2 id="desktop-hot-title">热门事项</h2>
            </div>
            <button type="button" onClick={() => send('还有哪些创业服务可以咨询？')} disabled={loading}>
              更多服务
              <Icon name="chevron" />
            </button>
          </header>

          <div className="desktop-hot__list">
            {HOT_ITEMS.map((item) => (
              <button
                key={item.key}
                className="desktop-hot__item"
                type="button"
                onClick={() => send(item.label)}
                disabled={loading}
              >
                <span className="desktop-hot__icon">
                  <Icon name={item.icon} />
                </span>
                <span className="desktop-hot__copy">
                  <strong>{item.label}</strong>
                  <small>{item.desc}</small>
                </span>
                <span className="desktop-hot__tag">
                  {item.key === 'loan' ? '贷款服务' : '补贴申领'}
                </span>
                <span className="desktop-card-arrow">
                  <Icon name="chevron" />
                </span>
              </button>
            ))}
          </div>
        </section>
      </div>

      <div className="chat__body">
      {active && (
        <div className="chat__home-row">
          <button
            type="button"
            className="chat__home-btn"
            onClick={resetToHome}
            disabled={loading}
            aria-label="返回主页"
          >
            <Home size={16} strokeWidth={2.2} aria-hidden="true" />
            返回主页
          </button>
        </div>
      )}
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
      <p className="desktop-footnote">
        <ShieldCheck size={17} strokeWidth={2} aria-hidden="true" />
        <span>政策权威</span>
        <i />
        <span>信息安全</span>
        <i />
        <span>专业服务</span>
      </p>
      <audio ref={audioRef} hidden />
    </div>
  )
}
