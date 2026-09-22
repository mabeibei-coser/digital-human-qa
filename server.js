import { synthesizeTTS } from './lib/volc-tts.js'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { randomUUID } from 'node:crypto'
import { execFile } from 'node:child_process'
import { writeFile, readFile, unlink } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import dotenv from 'dotenv'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
dotenv.config({ path: path.join(__dirname, '.env.local') })
dotenv.config({ path: path.join(__dirname, '.env') })

const { default: express } = await import('express')
const { buildJsConfig } = await import('./lib/wechat-jssdk.js')
const { getBananaRouterConfig, streamBananaRouterText } = await import('./lib/bananarouter-gemini.js')

// 生产用 PORT（部署时 pm2 分配）；开发用 API_PORT（4009，避开 vite 端口注入冲突）
const PORT =
  process.env.NODE_ENV === 'production'
    ? Number(process.env.PORT) || Number(process.env.API_PORT) || 4009
    : Number(process.env.API_PORT) || 4009

// ── BananaRouter Gemini-native LLM ──
// 文字问答走原生 streamGenerateContent SSE；不使用已验证失败的 OpenAI 兼容地址。
const LLM_CONFIG = getBananaRouterConfig()

// ── 火山 / 豆包 TTS（参考 A200 lib/volc-tts.ts）──
const TTS_APP_KEY = process.env.VOLC_TTS_APP_KEY
const TTS_ACCESS_KEY = process.env.VOLC_TTS_ACCESS_KEY

// ── 火山 ASR（语音识别）──
// 复用 TTS 的同一对密钥（VOLC_TTS_APP_KEY / VOLC_TTS_ACCESS_KEY）；大模型录音识别 flash 端点。
// 端点只稳定支持 wav/mp3，浏览器录的 webm/mp4 先用 ffmpeg 转 16k 单声道 wav。
const ASR_URL = 'https://openspeech.bytedance.com/api/v3/auc/bigmodel/recognize/flash'
const ASR_RESOURCE = process.env.VOLC_ASR_RESOURCE_ID || 'volc.bigasr.auc_turbo'

const SYSTEM_PROMPT = `你是"数字人演示平台"，服务于政府就业创业服务中心，面向有创业意向的市民。
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
  const volc = !!(TTS_APP_KEY && TTS_ACCESS_KEY)
  res.json({ ok: true, llm: !!LLM_CONFIG, tts: volc, asr: volc })
})

// 问答：BananaRouter Gemini-native SSE（边生成边吐字，前端按句边合成边播）。
app.post('/api/chat', async (req, res) => {
  const { question, history } = req.body || {}
  if (typeof question !== 'string' || !question.trim()) {
    return res.status(400).json({ error: '问题不能为空' })
  }
  if (!LLM_CONFIG) {
    return res.status(500).json({ error: '服务器未配置 BananaRouter API key' })
  }
  const hist = Array.isArray(history)
    ? history
        .filter((m) => m && typeof m.content === 'string' && (m.role === 'user' || m.role === 'assistant'))
        .slice(-6)
    : []
  const messages = [...hist, { role: 'user', content: question.trim() }]

  res.setHeader('Content-Type', 'text/event-stream; charset=utf-8')
  res.setHeader('Cache-Control', 'no-cache, no-transform')
  res.setHeader('Connection', 'keep-alive')
  res.setHeader('X-Accel-Buffering', 'no') // nginx 不要缓冲，否则流式失效
  if (res.flushHeaders) res.flushHeaders()

  try {
    await streamBananaRouterText({
      config: LLM_CONFIG,
      systemPrompt: SYSTEM_PROMPT,
      messages,
      onDelta: (delta) => res.write(`data: ${JSON.stringify({ delta })}\n\n`),
    })
  } catch (error) {
    console.error('[chat] stream failed:', error?.category || 'unknown')
    res.write(`data: ${JSON.stringify({ error: '智能助手暂时繁忙，请稍后再试' })}\n\n`)
  }
  res.write('data: [DONE]\n\n')
  res.end()
})

// 语音合成：火山 TTS → base64 MP3（未配密钥则静默降级，前端只显示文字）
app.post('/api/tts', async (req, res) => {
  const { text } = req.body || {}
  if (typeof text !== 'string' || !text.trim()) return res.status(400).json({ error: '文本不能为空' })
  if (!TTS_APP_KEY || !TTS_ACCESS_KEY) return res.json({ audio: '' })
  const audio = await synthesizeTTS(text.trim())
  res.json({ audio })
})

// 语音识别：浏览器录音(webm/mp4) → (ffmpeg 转 wav) → 火山 ASR → 返回 { text }
// 前端用原始二进制直传（Content-Type: audio/webm 等），不走 JSON body 解析。
app.post('/api/asr', async (req, res) => {
  if (!TTS_APP_KEY || !TTS_ACCESS_KEY) return res.json({ text: '' })
  let buf
  try {
    buf = await readRawBody(req, 8 * 1024 * 1024) // 8MB 上限
  } catch (e) {
    return res.status(413).json({ error: '录音过大' })
  }
  if (!buf || buf.length < 3000) return res.json({ text: '' }) // 太短，当作没说话
  const mime = String(req.headers['content-type'] || '').toLowerCase()
  const text = await transcribeAudio(buf, mime)
  res.json({ text })
})

function readRawBody(req, maxBytes) {
  return new Promise((resolve, reject) => {
    const chunks = []
    let total = 0
    req.on('data', (c) => {
      total += c.length
      if (total > maxBytes) {
        req.destroy()
        reject(new Error('audio too large'))
      } else {
        chunks.push(c)
      }
    })
    req.on('end', () => resolve(Buffer.concat(chunks)))
    req.on('error', reject)
  })
}

function extFromMime(mime) {
  if (mime.includes('webm')) return 'webm'
  if (mime.includes('mp4') || mime.includes('m4a')) return 'mp4'
  if (mime.includes('ogg')) return 'ogg'
  if (mime.includes('wav')) return 'wav'
  if (mime.includes('mp3') || mime.includes('mpeg')) return 'mp3'
  return 'webm'
}

// 非 wav/mp3 用 ffmpeg 转 16kHz 单声道 wav（火山 flash 端点要求）
async function convertToWav(inputBuffer, ext) {
  const id = randomUUID().slice(0, 8)
  const inputPath = path.join(tmpdir(), `asr-in-${id}.${ext}`)
  const outputPath = path.join(tmpdir(), `asr-out-${id}.wav`)
  await writeFile(inputPath, inputBuffer)
  try {
    await new Promise((resolve, reject) => {
      execFile(
        'ffmpeg',
        ['-i', inputPath, '-ar', '16000', '-ac', '1', '-f', 'wav', '-y', outputPath],
        { timeout: 15000 },
        (error, _stdout, stderr) => {
          if (error) {
            console.error('[asr] ffmpeg 失败:', String(stderr || '').slice(-160))
            reject(error)
          } else resolve()
        },
      )
    })
    return await readFile(outputPath)
  } finally {
    unlink(inputPath).catch(() => {})
    unlink(outputPath).catch(() => {})
  }
}

async function transcribeAudio(audioBuffer, mimeType) {
  const mime = (mimeType || '').toLowerCase()
  let finalBuffer = audioBuffer
  if (mime && !mime.includes('wav') && !mime.includes('mp3')) {
    try {
      finalBuffer = await convertToWav(audioBuffer, extFromMime(mime))
    } catch (e) {
      console.error('[asr] 转码失败:', e?.message || e)
      return ''
    }
  }
  const ctrl = new AbortController()
  const to = setTimeout(() => ctrl.abort(), 20000)
  try {
    const r = await fetch(ASR_URL, {
      method: 'POST',
      signal: ctrl.signal,
      headers: {
        'Content-Type': 'application/json',
        'X-Api-App-Key': TTS_APP_KEY,
        'X-Api-Access-Key': TTS_ACCESS_KEY,
        'X-Api-Resource-Id': ASR_RESOURCE,
        'X-Api-Request-Id': randomUUID(),
        'X-Api-Sequence': '-1',
      },
      body: JSON.stringify({
        user: { uid: randomUUID() },
        audio: { data: finalBuffer.toString('base64') },
        request: { model_name: 'bigmodel' },
      }),
    })
    const data = await r.json()
    if (data?.result?.text) return data.result.text
    console.error('[asr] 无识别结果:', data?.header?.code, data?.header?.message || JSON.stringify(data).slice(0, 200))
    return ''
  } catch (e) {
    console.error('[asr] 请求失败:', e?.name === 'AbortError' ? '超时' : e?.message || e)
    return ''
  } finally {
    clearTimeout(to)
  }
}

// ════════════ 微信 JS-SDK 网页分享签名 ════════════
// 前端 GET /api/wechat/js-config?url=<当前页URL> → 返回 wx.config 四件套。
// 只给本站(*.jsai100.com / localhost)签名，拒绝给任意外链签名。
app.get('/api/wechat/js-config', async (req, res) => {
  const rawUrl = String(req.query.url || '')
  let host
  try {
    const u = new URL(rawUrl)
    if (u.protocol !== 'http:' && u.protocol !== 'https:') throw new Error('proto')
    host = u.host
  } catch {
    return res.status(400).json({ error: 'url 不合法' })
  }
  const ok =
    host === 'jsai100.com' ||
    host.endsWith('.jsai100.com') ||
    host === 'localhost' ||
    host.startsWith('localhost:') ||
    host.startsWith('127.0.0.1')
  if (!ok) {
    return res.status(400).json({ error: 'url 非本站，拒绝签名' })
  }
  try {
    res.json(await buildJsConfig(rawUrl))
  } catch (err) {
    console.error('[js-config] failed:', err.message)
    res.status(500).json({ error: '签名生成失败' })
  }
})

app.post('/api/wechat/share-debug', (req, res) => {
  const body = req.body || {}
  const safe = {
    ts: new Date().toISOString(),
    status: String(body.status || '').slice(0, 80),
    signUrl: String(body.signUrl || '').slice(0, 240),
    link: String(body.link || '').slice(0, 240),
    imgUrl: String(body.imgUrl || '').slice(0, 240),
    href: String(body.href || '').slice(0, 240),
    message: String(body.message || '').slice(0, 240),
    result: body.result && typeof body.result === 'object'
      ? JSON.stringify(body.result).slice(0, 400)
      : String(body.result || '').slice(0, 240),
    ua: String(req.headers['user-agent'] || '').slice(0, 240),
  }
  console.log('[wx-share-debug]', JSON.stringify(safe))
  res.json({ ok: true })
})

// 生产：托管 dist/
if (process.env.NODE_ENV === 'production') {
  const distDir = path.join(__dirname, 'dist')
  app.use(express.static(distDir))
  app.get('*', (req, res) => res.sendFile(path.join(distDir, 'index.html')))
}

app.listen(PORT, () => console.log(`[a900] api server on http://localhost:${PORT}`))
