import path from 'node:path'
import { randomUUID } from 'node:crypto'
import { fileURLToPath } from 'node:url'
import { copyFile, mkdir, readFile, unlink, writeFile } from 'node:fs/promises'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import dotenv from 'dotenv'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const root = path.resolve(__dirname, '..')
const configPath = path.join(root, 'src', 'welcome.config.json')
const TTS_URL = 'https://openspeech.bytedance.com/api/v1/tts'
const TTS_RESOURCE = 'volc.service_type.10029'
const execFileAsync = promisify(execFile)

dotenv.config({ path: path.join(root, '.env.local') })
dotenv.config({ path: path.join(root, '.env') })

const appKey = process.env.VOLC_TTS_APP_KEY
const accessKey = process.env.VOLC_TTS_ACCESS_KEY
const speaker = process.env.VOLC_TTS_SPEAKER || 'zh_female_vv_uranus_bigtts'

const config = JSON.parse(await readFile(configPath, 'utf8'))
const text = String(config.text || '').trim()
const speedRatio = Number(config.speedRatio) || 1.0
const targetSpeechDurationSeconds = Number(config.targetSpeechDurationSeconds) || null
const leadSilenceSeconds = Math.max(0, Number(config.leadSilenceSeconds) || 0)

if (!text) throw new Error('src/welcome.config.json 里的 text 不能为空')
if (!appKey || !accessKey) throw new Error('缺少 VOLC_TTS_APP_KEY / VOLC_TTS_ACCESS_KEY')
if (speedRatio < 0.5 || speedRatio > 2.0) throw new Error('speedRatio 建议设置在 0.5 到 2.0 之间')

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
          audio: { voice_type: speaker, encoding: 'mp3', speed_ratio: speedRatio },
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

async function probeDuration(filePath) {
  const { stdout } = await execFileAsync('ffprobe', [
    '-v',
    'error',
    '-show_entries',
    'format=duration',
    '-of',
    'default=noprint_wrappers=1:nokey=1',
    filePath,
  ])
  const textValue = stdout.trim()
  return textValue ? Number(textValue) : NaN
}

function atempoFilter(factor) {
  const parts = []
  let rest = factor
  while (rest > 2) {
    parts.push(2)
    rest /= 2
  }
  while (rest < 0.5) {
    parts.push(0.5)
    rest /= 0.5
  }
  parts.push(rest)
  return parts.map((item) => `atempo=${item.toFixed(6)}`).join(',')
}

const audioBase64 = await synthesize(text)
const outPath = path.join(root, 'public', config.audio)
await mkdir(path.dirname(outPath), { recursive: true })
const speechPath = `${outPath}.speech.tmp.mp3`
const trimmedSpeechPath = `${outPath}.speech.trim.tmp.mp3`
const adjustedSpeechPath = `${outPath}.speech.adjusted.tmp.mp3`
await writeFile(speechPath, Buffer.from(audioBase64, 'base64'))

// 去掉 TTS 自带的首尾静音（豆包输出开头常有 ~0.3s 静音）→ 否则欢迎语开口比口型晚两个字。
// 首段 silenceremove 去前导静音；areverse 翻转后再 remove 去尾部静音，再翻回。
await execFileAsync('ffmpeg', [
  '-y',
  '-i',
  speechPath,
  '-af',
  'silenceremove=start_periods=1:start_threshold=-50dB,areverse,silenceremove=start_periods=1:start_threshold=-50dB,areverse',
  '-codec:a',
  'libmp3lame',
  '-q:a',
  '4',
  trimmedSpeechPath,
])

let speechSourcePath = trimmedSpeechPath
let measuredSpeechDuration = await probeDuration(trimmedSpeechPath)
if (targetSpeechDurationSeconds && Number.isFinite(measuredSpeechDuration)) {
  const tempo = measuredSpeechDuration / targetSpeechDurationSeconds
  await execFileAsync('ffmpeg', [
    '-y',
    '-i',
    trimmedSpeechPath,
    '-filter:a',
    atempoFilter(tempo),
    '-codec:a',
    'libmp3lame',
    '-q:a',
    '4',
    adjustedSpeechPath,
  ])
  speechSourcePath = adjustedSpeechPath
  measuredSpeechDuration = await probeDuration(adjustedSpeechPath)
}

if (leadSilenceSeconds > 0) {
  await execFileAsync('ffmpeg', [
    '-y',
    '-f',
    'lavfi',
    '-t',
    String(leadSilenceSeconds),
    '-i',
    'anullsrc=r=44100:cl=stereo',
    '-i',
    speechSourcePath,
    '-filter_complex',
    '[0:a][1:a]concat=n=2:v=0:a=1[a]',
    '-map',
    '[a]',
    '-codec:a',
    'libmp3lame',
    '-q:a',
    '4',
    outPath,
  ])
} else {
  await copyFile(speechSourcePath, outPath)
}
await unlink(speechPath).catch(() => {})
await unlink(trimmedSpeechPath).catch(() => {})
await unlink(adjustedSpeechPath).catch(() => {})

const nextConfig = {
  ...config,
  version: new Date().toISOString().replace(/\D/g, '').slice(0, 14),
}
await writeFile(configPath, `${JSON.stringify(nextConfig, null, 2)}\n`)

let durationNote = ''
if (targetSpeechDurationSeconds || leadSilenceSeconds) {
  try {
    const total = await probeDuration(outPath)
    const speech = measuredSpeechDuration
    if (Number.isFinite(total)) {
      const effectiveSpeech = Number.isFinite(speech) ? speech : Math.max(0, total - leadSilenceSeconds)
      const delta = targetSpeechDurationSeconds ? effectiveSpeech - targetSpeechDurationSeconds : 0
      durationNote = `，总时长 ${total.toFixed(3)}s，正文 ${effectiveSpeech.toFixed(3)}s，目标正文 ${targetSpeechDurationSeconds?.toFixed(3) ?? '-'}s，偏差 ${delta >= 0 ? '+' : ''}${delta.toFixed(3)}s`
    }
  } catch {
    durationNote = '，未能用 ffprobe 测量时长'
  }
}

console.log(`已生成 ${path.relative(root, outPath)}，欢迎语版本 ${nextConfig.version}${durationNote}`)
