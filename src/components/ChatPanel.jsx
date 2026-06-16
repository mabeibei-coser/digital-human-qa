import { useEffect, useRef, useState } from 'react'

const SUGGESTED = [
  '我想创业，第一步该做什么？',
  '大学生创业有哪些补贴政策？',
  '注册公司需要准备什么材料？',
  '创业担保贷款怎么申请？',
]

const WELCOME =
  '您好！我是创业服务中心的智能助手，关于创业扶持政策、开办流程、补贴申领等问题都可以问我～'

export default function ChatPanel({ onAsk }) {
  const [messages, setMessages] = useState([{ role: 'assistant', text: WELCOME }])
  const [input, setInput] = useState('')
  const listRef = useRef(null)

  useEffect(() => {
    const el = listRef.current
    if (el) el.scrollTop = el.scrollHeight
  }, [messages])

  function send(text) {
    const q = (text ?? input).trim()
    if (!q) return
    setMessages((m) => [...m, { role: 'user', text: q }])
    setInput('')
    onAsk?.(q)
    // 第一版脚本化演示回答；正式版接 AI 问答后实时生成
    setTimeout(() => {
      setMessages((m) => [
        ...m,
        {
          role: 'assistant',
          text: '（演示）数字人将语音播报对「' + q + '」的解答，正式版接入 AI 后实时生成。',
        },
      ])
    }, 600)
  }

  return (
    <div className="chat-panel">
      <div className="chat-messages" ref={listRef}>
        {messages.map((m, i) => (
          <div key={i} className={'chat-bubble chat-bubble--' + m.role}>
            {m.text}
          </div>
        ))}
      </div>

      <div className="chat-suggestions">
        {SUGGESTED.map((q) => (
          <button key={q} className="chip" onClick={() => send(q)}>
            {q}
          </button>
        ))}
      </div>

      <div className="chat-input">
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && send()}
          placeholder="输入您的创业问题…"
        />
        <button onClick={() => send()}>发送</button>
      </div>
    </div>
  )
}
