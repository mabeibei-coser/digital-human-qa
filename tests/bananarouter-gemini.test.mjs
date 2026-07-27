import assert from 'node:assert/strict'
import test from 'node:test'

import {
  BananaRouterStreamError,
  getBananaRouterConfig,
  streamBananaRouterText,
} from '../lib/bananarouter-gemini.js'

const config = {
  apiKey: 'unit-test-placeholder',
  baseURL: 'https://example.test',
  model: 'gemini-test',
}

function chunkedSseResponse(raw, chunkSizes) {
  const bytes = new TextEncoder().encode(raw)
  let offset = 0
  const chunks = []
  for (const size of chunkSizes) {
    if (offset >= bytes.length) break
    chunks.push(bytes.slice(offset, Math.min(bytes.length, offset + size)))
    offset += size
  }
  if (offset < bytes.length) chunks.push(bytes.slice(offset))
  return new Response(
    new ReadableStream({
      start(controller) {
        for (const chunk of chunks) controller.enqueue(chunk)
        controller.close()
      },
    }),
    { status: 200, headers: { 'Content-Type': 'text/event-stream' } },
  )
}

function assertCategory(category) {
  return (error) => {
    assert.ok(error instanceof BananaRouterStreamError)
    assert.equal(error.category, category)
    assert.doesNotMatch(error.message, /unit-test-placeholder|Authorization|response-secret/)
    return true
  }
}

test('缺少 key 时不启用 BananaRouter，默认值使用 Gemini-native 合同', () => {
  assert.equal(getBananaRouterConfig({}), null)
  assert.deepEqual(getBananaRouterConfig({ BANANAROUTER_API_KEY: ' placeholder ' }), {
    apiKey: 'placeholder',
    baseURL: 'https://api.bananarouter.com',
    model: 'gemini-3.1-flash-lite',
  })
})

test('任意字节分块的 Gemini SSE 会转成连续 delta', async () => {
  const deltas = []
  let capturedUrl = ''
  let capturedInit
  const fetchImpl = async (input, init) => {
    capturedUrl = String(input)
    capturedInit = init
    return chunkedSseResponse(
      [
        'data: {"candidates":[{"content":{"parts":[{"text":"创业"}]}}]}\r\n\r\n',
        ': keep-alive\r\n\r\n',
        'data: {"candidates":[{"content":{"parts":[{"text":"政策。"}]}}]}\r\n\r\n',
      ].join(''),
      [1, 2, 5, 3, 11, 1, 7, 4, 2],
    )
  }

  const result = await streamBananaRouterText({
    config,
    systemPrompt: 'system',
    messages: [
      { role: 'user', content: '上一问' },
      { role: 'assistant', content: '上一答' },
      { role: 'user', content: '当前问题' },
    ],
    onDelta: (delta) => deltas.push(delta),
    fetchImpl,
  })

  assert.equal(
    capturedUrl,
    'https://example.test/v1beta/models/gemini-test:streamGenerateContent?alt=sse',
  )
  const headers = new Headers(capturedInit.headers)
  assert.equal(headers.get('Authorization'), 'Bearer unit-test-placeholder')
  assert.equal(headers.get('Accept'), 'text/event-stream')
  const body = JSON.parse(String(capturedInit.body))
  assert.equal(body.systemInstruction.parts[0].text, 'system')
  assert.deepEqual(body.contents.map((item) => item.role), ['user', 'model', 'user'])
  assert.equal(body.contents[2].parts[0].text, '当前问题')
  assert.deepEqual(deltas, ['创业', '政策。'])
  assert.deepEqual(result, { gotText: true, sawInvalidEvent: false })
})

test('401/403、429 和其他 HTTP 错误会被安全分类', async () => {
  for (const [status, category] of [
    [401, 'unauthorized'],
    [403, 'unauthorized'],
    [429, 'rate_limited'],
    [500, 'provider_error'],
  ]) {
    await assert.rejects(
      streamBananaRouterText({
        config,
        systemPrompt: 'system',
        messages: [{ role: 'user', content: 'question' }],
        onDelta() {},
        fetchImpl: async () => new Response('response-secret', { status }),
      }),
      assertCategory(category),
    )
  }
})

test('超时与网络失败被区分且错误不泄露', async () => {
  const timeoutFetch = (_input, init) =>
    new Promise((_resolve, reject) => {
      init.signal.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')))
    })
  await assert.rejects(
    streamBananaRouterText({
      config,
      systemPrompt: 'system',
      messages: [{ role: 'user', content: 'question' }],
      onDelta() {},
      fetchImpl: timeoutFetch,
      timeoutMs: 5,
    }),
    assertCategory('timeout'),
  )

  await assert.rejects(
    streamBananaRouterText({
      config,
      systemPrompt: 'system',
      messages: [{ role: 'user', content: 'question' }],
      onDelta() {},
      fetchImpl: async () => {
        throw new Error('network response-secret')
      },
    }),
    assertCategory('network_error'),
  )
})

test('坏事件和空流不会被冒充为成功', async () => {
  for (const response of [
    chunkedSseResponse('data: {not-json}\n\n', [2, 1, 4]),
    chunkedSseResponse('data: {"candidates":[]}\n\n', [3, 2]),
    chunkedSseResponse('', []),
  ]) {
    await assert.rejects(
      streamBananaRouterText({
        config,
        systemPrompt: 'system',
        messages: [{ role: 'user', content: 'question' }],
        onDelta() {},
        fetchImpl: async () => response,
      }),
      assertCategory('invalid_response'),
    )
  }
})

test('坏事件之后仍有有效内容时保留有效 delta，并标记上游异常', async () => {
  const deltas = []
  const result = await streamBananaRouterText({
    config,
    systemPrompt: 'system',
    messages: [{ role: 'user', content: 'question' }],
    onDelta: (delta) => deltas.push(delta),
    fetchImpl: async () =>
      chunkedSseResponse(
        'data: {bad}\n\ndata: {"candidates":[{"content":{"parts":[{"text":"有效"}]}}]}\n\n',
        [1, 1, 2, 3, 5],
      ),
  })
  assert.deepEqual(deltas, ['有效'])
  assert.deepEqual(result, { gotText: true, sawInvalidEvent: true })
})
