const DEFAULT_BASE_URL = 'https://api.bananarouter.com'
const DEFAULT_MODEL = 'gemini-3.1-flash-lite'

export class BananaRouterStreamError extends Error {
  constructor(category, message) {
    super(message)
    this.name = 'BananaRouterStreamError'
    this.category = category
  }
}

export function getBananaRouterConfig(env = process.env) {
  const apiKey = env.BANANAROUTER_API_KEY?.trim()
  if (!apiKey) return null
  return {
    apiKey,
    baseURL: (env.BANANAROUTER_BASE_URL?.trim() || DEFAULT_BASE_URL).replace(/\/+$/, ''),
    model: env.BANANAROUTER_MODEL?.trim() || DEFAULT_MODEL,
  }
}

function extractText(payload) {
  const parts = payload?.candidates?.[0]?.content?.parts
  if (!Array.isArray(parts)) return ''
  return parts
    .map((part) => (typeof part?.text === 'string' ? part.text : ''))
    .join('')
}

function toGeminiContents(messages) {
  return messages
    .filter(
      (message) =>
        message &&
        typeof message.content === 'string' &&
        message.content.trim() &&
        (message.role === 'user' || message.role === 'assistant'),
    )
    .map((message) => ({
      role: message.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: message.content }],
    }))
}

function safeError(category, status) {
  if (category === 'unauthorized') {
    return new BananaRouterStreamError(category, 'BananaRouter 鉴权失败')
  }
  if (category === 'rate_limited') {
    return new BananaRouterStreamError(category, 'BananaRouter 请求受限')
  }
  if (category === 'timeout') {
    return new BananaRouterStreamError(category, 'BananaRouter 请求超时')
  }
  if (category === 'invalid_response') {
    return new BananaRouterStreamError(category, 'BananaRouter 返回内容无效')
  }
  if (category === 'provider_error') {
    return new BananaRouterStreamError(category, `BananaRouter 上游失败（HTTP ${status}）`)
  }
  return new BananaRouterStreamError('network_error', 'BananaRouter 网络请求失败')
}

export async function streamBananaRouterText({
  config,
  systemPrompt,
  messages,
  onDelta,
  fetchImpl = fetch,
  timeoutMs = 60_000,
}) {
  const endpoint =
    `${config.baseURL.replace(/\/+$/, '')}/v1beta/models/` +
    `${encodeURIComponent(config.model)}:streamGenerateContent?alt=sse`
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)

  try {
    const response = await fetchImpl(endpoint, {
      method: 'POST',
      redirect: 'error',
      headers: {
        Authorization: `Bearer ${config.apiKey}`,
        'Content-Type': 'application/json',
        Accept: 'text/event-stream',
      },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: systemPrompt }] },
        contents: toGeminiContents(messages),
        generationConfig: {
          temperature: 0.7,
          maxOutputTokens: 600,
        },
      }),
      signal: controller.signal,
    })

    if (response.status === 401 || response.status === 403) throw safeError('unauthorized')
    if (response.status === 429) throw safeError('rate_limited')
    if (!response.ok) throw safeError('provider_error', response.status)
    if (!response.body) throw safeError('invalid_response')

    const reader = response.body.getReader()
    const decoder = new TextDecoder()
    let buffer = ''
    let gotText = false
    let sawInvalidEvent = false

    const consumeEvent = (event) => {
      const data = event
        .split(/\r?\n/)
        .filter((line) => line.startsWith('data:'))
        .map((line) => line.slice(5).trimStart())
        .join('\n')
        .trim()
      if (!data || data === '[DONE]') return
      try {
        const delta = extractText(JSON.parse(data))
        if (delta) {
          gotText = true
          onDelta(delta)
        }
      } catch {
        sawInvalidEvent = true
      }
    }

    while (true) {
      const { value, done } = await reader.read()
      if (done) break
      buffer += decoder.decode(value, { stream: true })
      let separator = buffer.match(/\r?\n\r?\n/)
      while (separator?.index != null) {
        consumeEvent(buffer.slice(0, separator.index))
        buffer = buffer.slice(separator.index + separator[0].length)
        separator = buffer.match(/\r?\n\r?\n/)
      }
    }
    buffer += decoder.decode()
    if (buffer.trim()) consumeEvent(buffer)

    if (!gotText) throw safeError('invalid_response')
    return { gotText: true, sawInvalidEvent }
  } catch (error) {
    if (error instanceof BananaRouterStreamError) throw error
    if (controller.signal.aborted) throw safeError('timeout')
    throw safeError('network_error')
  } finally {
    clearTimeout(timer)
  }
}
