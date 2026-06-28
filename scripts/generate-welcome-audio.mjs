import path from 'node:path'
import { randomUUID } from 'node:crypto'
import { fileURLToPath } from 'node:url'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import dotenv from 'dotenv'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const root = path.resolve(__dirname, '..')
const configPath = path.join(root, 'src', 'welcome.config.json')
const TTS_URL = 'https://openspeech.bytedance.com/api/v1/tts'
const TTS_RESOURCE = 'volc.service_type.10029'

dotenv.config({ path: path.join(root, '.env.local') })
dotenv.config({ path: path.join(root, '.env') })

const appKey = process.env.VOLC_TTS_APP_KEY
const accessKey = process.env.VOLC_TTS_ACCESS_KEY
const speaker = process.env.VOLC_TTS_SPEAKER || 'zh_female_vv_uranus_bigtts'

const config = JSON.parse(await readFile(configPath, 'utf8'))
const text = String(config.text || '').trim()

if (!text) throw new Error('src/welcome.config.json 里的 text 不能为空')
if (!appKey || !accessKey) throw new Error('缺少 VOLC_TTS_APP_KEY / VOLC_TTS_ACCESS_KEY')

async function synthesize(textToRead, maxRetries = 2) {
  let delay = 800
  for (let attempt = 0; attempt <= maxRetries; attempt += 1) {
    const ctrl = new AbortController()
    const timer = setTimeout(() => ctrl.abort(), 12000)
    try {
      const res = await fetch(TTS_URL, {
        method: 'POST',
        signal: ctrl.signal,
        headers: {
          'Content-Type': 'application/json',
          'X-Api-App-Key': appKey,
          'X-Api-Access-Key': accessKey,
          'X-Api-Resource-Id': TTS_RESOURCE,
        },
        body: JSON.stringify({
          app: { appid: appKey, cluster: 'volcano_bigtts' },
          user: { uid: randomUUID() },
          audio: { voice_type: speaker, encoding: 'mp3', speed_ratio: 1.0 },
          request: { reqid: randomUUID(), text: textToRead, operation: 'query' },
        }),
      })
      clearTimeout(timer)
      if (res.status === 429 && attempt < maxRetries) {
        await new Promise((resolve) => setTimeout(resolve, delay))
        delay *= 2
        continue
      }
      const data = await res.json()
      if (data.data) return data.data
      throw new Error(`TTS 没有返回音频：${data.code || ''} ${data.message || ''}`.trim())
    } catch (error) {
      clearTimeout(timer)
      if (attempt >= maxRetries) throw error
      await new Promise((resolve) => setTimeout(resolve, delay))
      delay *= 2
    }
  }
  throw new Error('TTS 生成失败')
}

const audioBase64 = await synthesize(text)
const outPath = path.join(root, 'public', config.audio)
await mkdir(path.dirname(outPath), { recursive: true })
await writeFile(outPath, Buffer.from(audioBase64, 'base64'))

const nextConfig = {
  ...config,
  version: new Date().toISOString().replace(/\D/g, '').slice(0, 12),
}
await writeFile(configPath, `${JSON.stringify(nextConfig, null, 2)}\n`)

console.log(`已生成 ${path.relative(root, outPath)}，欢迎语版本 ${nextConfig.version}`)
