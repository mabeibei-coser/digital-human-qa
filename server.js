import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { randomUUID } from 'node:crypto'
import dotenv from 'dotenv'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
dotenv.config({ path: path.join(__dirname, '.env.local') })
dotenv.config({ path: path.join(__dirname, '.env') })

const { default: express } = await import('express')

// 生产用 PORT（部署时 pm2 分配）；开发用 API_PORT（4009，避开 vite 端口注入冲突）
const PORT =
  process.env.NODE_ENV === 'production'
    ? Number(process.env.PORT) || Number(process.env.API_PORT) || 4009
    : Number(process.env.API_PORT) || 4009

// ── 讯飞星火 LLM ──
// 默认 xopqwen36v35b（通义千问，走讯飞 MaaS）——流式快、逐字、现场演示开口约 7s；
// 讯飞星火本牌 xsparkx2flash 也可（改 IFLYTEK_MODEL 即可，但开口慢约一倍 ~14s）。
// astron-code-latest（代码模型）作兜底——同端点、同 key，只换 model。
// （注：A400 的 IFLYTEK_FALLBACK_*（maas-api / xop35qwen2b）实测 AppIdNoAuthError，弃用。）
const LLM_URL =
  (process.env.IFLYTEK_BASE_URL || 'https://maas-coding-api.cn-huabei-1.xf-yun.com/v2') + '/chat/completions'
const PRIMARY_URL = LLM_URL
const PRIMARY_KEY = process.env.IFLYTEK_API_KEY
const PRIMARY_MODEL = process.env.IFLYTEK_MODEL || 'xopqwen36v35b'
const FB_URL = LLM_URL
const FB_KEY = process.env.IFLYTEK_API_KEY
const FB_MODEL = 'astron-code-latest'
const FB_ENABLED = !!FB_KEY && FB_MODEL !== PRIMARY_MODEL

// ── 火山 / 豆包 TTS（参考 A200 lib/volc-tts.ts）──
const TTS_URL = 'https://openspeech.bytedance.com/api/v1/tts'
const TTS_RESOURCE = 'volc.service_type.10029'
const TTS_APP_KEY = process.env.VOLC_TTS_APP_KEY
const TTS_ACCESS_KEY = process.env.VOLC_TTS_ACCESS_KEY
const TTS_SPEAKER = process.env.VOLC_TTS_SPEAKER || 'zh_female_vv_uranus_bigtts'

const SYSTEM_PROMPT = `你是"创业服务智能助手"，服务于政府就业创业服务中心，面向有创业意向的市民。
你的任务：用通俗、亲切、口语化的中文，解答创业扶持政策、开办流程、补贴申领、创业担保贷款、社保就业等问题。
要求：
- 回答简短，控制在 80-160 字，像窗口工作人员当面讲解一样自然。
- 纯口语文本，不要用 markdown、不要用列表符号、星号、井号或表格（你的回答会被语音朗读出来）。
- 涉及具体金额 / 申报材料 / 时限时，给方向性指引，并提示"具体以当地最新政策和办事窗口为准"，不要编造精确数字。
- 只回答创业 / 就业 / 社保相关问题；无关问题礼貌引导回正题。`

const app = express()
app.set('trust proxy', true)

// 子路径部署时请求带 /a900 前缀，统一剥掉，路由按 /api 定义
app.use((req, res, next) => {
  const m = req.url.match(/^\/a900(\/.*)$/)
  if (m) req.url = m[1]
  next()
})

// 自实现 JSON body 解析（沿用 A500：线上 nginx→Express 对 application/json 偶发 400，绕开 body-parser）
app.use((req, res, next) => {
  if (req.method === 'GET' || req.method === 'HEAD') return next()
  const ct = String(req.headers['content-type'] || '').toLowerCase()
  if (!ct.includes('application/json')) return next()
  const chunks = []
  let total = 0
  const MAX = 256 * 1024
  req.on('data', (c) => {
    total += c.length
    if (total > MAX) req.destroy()
    else chunks.push(c)
  })
  req.on('end', () => {
    const raw = Buffer.concat(chunks).toString('utf8')
    if (!raw) {
      req.body = {}
      return next()
    }
    try {
      req.body = JSON.parse(raw)
      next()
    } catch (e) {
      res.status(400).json({ error: 'JSON 解析失败' })
    }
  })
  req.on('error', next)
})

app.get('/api/health', (req, res) => {
  res.json({ ok: true, llm: !!PRIMARY_KEY, tts: !!(TTS_APP_KEY && TTS_ACCESS_KEY) })
})

// 问答：讯飞星火，**SSE 流式**（边生成边吐字，前端按句边合成边播）。主→兜底。
app.post('/api/chat', async (req, res) => {
  const { question, history } = req.body || {}
  if (typeof question !== 'string' || !question.trim()) {
    return res.status(400).json({ error: '问题不能为空' })
  }
  if (!PRIMARY_KEY) {
    return res.status(500).json({ error: '服务器未配置讯飞 API key' })
  }
  const hist = Array.isArray(history)
    ? history
        .filter((m) => m && typeof m.content === 'string' && (m.role === 'user' || m.role === 'assistant'))
        .slice(-6)
    : []
  const messages = [
    { role: 'system', content: SYSTEM_PROMPT },
    ...hist,
    { role: 'user', content: question.trim() },
  ]

  res.setHeader('Content-Type', 'text/event-stream; charset=utf-8')
  res.setHeader('Cache-Control', 'no-cache, no-transform')
  res.setHeader('Connection', 'keep-alive')
  res.setHeader('X-Accel-Buffering', 'no') // nginx 不要缓冲，否则流式失效
  if (res.flushHeaders) res.flushHeaders()

  let got = await streamLLM({ url: PRIMARY_URL, key: PRIMARY_KEY, model: PRIMARY_MODEL, messages, res })
  if (!got && FB_ENABLED) {
    got = await streamLLM({ url: FB_URL, key: FB_KEY, model: FB_MODEL, messages, res })
  }
  if (!got) res.write(`data: ${JSON.stringify({ error: '智能助手暂时繁忙，请稍后再试' })}\n\n`)
  res.write('data: [DONE]\n\n')
  res.end()
})

// 从一个 LLM endpoint 流式读取，逐 delta 转发给前端。返回是否拿到过内容。
async function streamLLM({ url, key, model, messages, res }, timeoutMs = 60000) {
  let got = false
  try {
    const r = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
      body: JSON.stringify({ model, messages, temperature: 0.7, max_tokens: 600, stream: true }),
      signal: AbortSignal.timeout(timeoutMs),
    })
    if (!r.ok || !r.body) {
      const t = r.text ? await r.text().catch(() => '') : ''
      console.error('[chat] stream HTTP', r.status, String(t).slice(0, 150))
      return false
    }
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
        if (data === '[DONE]') return got
        try {
          const delta = JSON.parse(data)?.choices?.[0]?.delta?.content
          if (delta) {
            got = true
            res.write(`data: ${JSON.stringify({ delta })}\n\n`)
          }
        } catch {
          /* 非 JSON 行忽略 */
        }
      }
    }
  } catch (e) {
    console.error('[chat] stream err:', e?.message || e)
  }
  return got
}

// 语音合成：火山 TTS → base64 MP3（未配密钥则静默降级，前端只显示文字）
app.post('/api/tts', async (req, res) => {
  const { text } = req.body || {}
  if (typeof text !== 'string' || !text.trim()) return res.status(400).json({ error: '文本不能为空' })
  if (!TTS_APP_KEY || !TTS_ACCESS_KEY) return res.json({ audio: '' })
  const audio = await synthesizeTTS(text.trim())
  res.json({ audio })
})

async function synthesizeTTS(text, maxRetries = 2) {
  let delay = 800
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    const ctrl = new AbortController()
    const to = setTimeout(() => ctrl.abort(), 12000)
    try {
      const r = await fetch(TTS_URL, {
        method: 'POST',
        signal: ctrl.signal,
        headers: {
          'Content-Type': 'application/json',
          'X-Api-App-Key': TTS_APP_KEY,
          'X-Api-Access-Key': TTS_ACCESS_KEY,
          'X-Api-Resource-Id': TTS_RESOURCE,
        },
        body: JSON.stringify({
          app: { appid: TTS_APP_KEY, cluster: 'volcano_bigtts' },
          user: { uid: randomUUID() },
          audio: { voice_type: TTS_SPEAKER, encoding: 'mp3', speed_ratio: 1.0 },
          request: { reqid: randomUUID(), text, operation: 'query' },
        }),
      })
      if (r.status === 429) {
        clearTimeout(to)
        await new Promise((s) => setTimeout(s, delay))
        delay *= 2
        continue
      }
      const d = await r.json()
      clearTimeout(to)
      if (d.data) return d.data
      console.error(`[tts] no audio (attempt ${attempt + 1}):`, d?.code, d?.message)
    } catch (e) {
      clearTimeout(to)
      console.error(`[tts] failed attempt ${attempt + 1}:`, e?.message || e)
    }
    // 任意失败（含偶发 3011）→ 等一下再重试
    if (attempt < maxRetries) {
      await new Promise((s) => setTimeout(s, delay))
      delay *= 2
    }
  }
  return ''
}

// 生产：托管 dist/
if (process.env.NODE_ENV === 'production') {
  const distDir = path.join(__dirname, 'dist')
  app.use(express.static(distDir))
  app.get('*', (req, res) => res.sendFile(path.join(distDir, 'index.html')))
}

app.listen(PORT, () => console.log(`[a900] api server on http://localhost:${PORT}`))
