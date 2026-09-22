import { requestSpeech } from './volc-tts-provider.mjs'

// Runtime answers and welcome audio share the same provider and retry policy.
export async function synthesizeTTS(text, maxRetries = 2, { speechRate = 0 } = {}) {
  if (process.env.E2E_MOCK_MODE === 'true') return ''
  const appKey = process.env.VOLC_TTS_APP_KEY
  const accessKey = process.env.VOLC_TTS_ACCESS_KEY
  if (!appKey || !accessKey) return ''
  const speaker = process.env.VOLC_TTS_SPEAKER || 'zh_female_vv_uranus_bigtts'
  let delay = 800
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    const ctrl = new AbortController()
    const timer = setTimeout(() => ctrl.abort(), 12000)
    try {
      const audio = await requestSpeech(text, { appKey, accessKey, speaker, speechRate, signal: ctrl.signal })
      return audio.toString('base64')
    } catch (error) {
      console.error(`[tts] failed attempt ${attempt + 1}:`, error?.message)
    } finally {
      clearTimeout(timer)
    }
    if (attempt < maxRetries) {
      await new Promise(resolve => setTimeout(resolve, delay))
      delay *= 2
    }
  }
  return ''
}
