import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import http from 'node:http'
import { once } from 'node:events'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

function listen(server) {
  return new Promise((resolve, reject) => {
    server.once('error', reject)
    server.listen(0, '127.0.0.1', () => {
      server.off('error', reject)
      resolve(server.address().port)
    })
  })
}

async function freePort() {
  const server = http.createServer()
  const port = await listen(server)
  await new Promise((resolve) => server.close(resolve))
  return port
}

async function waitForHealth(port, child) {
  for (let attempt = 0; attempt < 40; attempt += 1) {
    if (child.exitCode != null) throw new Error('A900 server exited before health check')
    try {
      const response = await fetch(`http://127.0.0.1:${port}/api/health`)
      if (response.ok) return await response.json()
    } catch {
      // Server is still starting.
    }
    await new Promise((resolve) => setTimeout(resolve, 100))
  }
  throw new Error('A900 server health check timed out')
}

async function stopChild(child) {
  if (child.exitCode != null) return
  const exited = once(child, 'exit')
  child.kill()
  await exited
}

test('POST /api/chat 将 Gemini-native SSE 映射为既有 delta 与 DONE', async () => {
  let upstreamRequest = null
  const upstream = http.createServer((req, res) => {
    const chunks = []
    req.on('data', (chunk) => chunks.push(chunk))
    req.on('end', () => {
      upstreamRequest = {
        method: req.method,
        url: req.url,
        authorization: req.headers.authorization,
        body: JSON.parse(Buffer.concat(chunks).toString('utf8')),
      }
      res.writeHead(200, { 'Content-Type': 'text/event-stream' })
      res.write('data: {"candidates":[{"content":{"parts":[{"text":"part-1"}]}}]}\n\n')
      res.end('data: {"candidates":[{"content":{"parts":[{"text":"part-2"}]}}]}\n\n')
    })
  })
  const upstreamPort = await listen(upstream)
  const appPort = await freePort()
  const child = spawn(process.execPath, ['server.js'], {
    cwd: root,
    env: {
      ...process.env,
      NODE_ENV: 'test',
      API_PORT: String(appPort),
      BANANAROUTER_API_KEY: 'local-contract-placeholder',
      BANANAROUTER_BASE_URL: `http://127.0.0.1:${upstreamPort}`,
      BANANAROUTER_MODEL: 'gemini-test',
      VOLC_TTS_APP_KEY: '',
      VOLC_TTS_ACCESS_KEY: '',
    },
    stdio: 'ignore',
    windowsHide: true,
  })

  try {
    const health = await waitForHealth(appPort, child)
    assert.equal(health.llm, true)
    const response = await fetch(`http://127.0.0.1:${appPort}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        question: 'contract-question',
        history: [
          { role: 'user', content: 'history-question' },
          { role: 'assistant', content: 'history-answer' },
        ],
      }),
    })
    assert.equal(response.status, 200)
    assert.match(response.headers.get('content-type') || '', /text\/event-stream/)
    const body = await response.text()
    const first = body.indexOf('data: {"delta":"part-1"}')
    const second = body.indexOf('data: {"delta":"part-2"}')
    const done = body.indexOf('data: [DONE]')
    assert.ok(first >= 0 && second > first && done > second)
    assert.doesNotMatch(body, /error/)

    assert.equal(upstreamRequest.method, 'POST')
    assert.equal(
      upstreamRequest.url,
      '/v1beta/models/gemini-test:streamGenerateContent?alt=sse',
    )
    assert.equal(upstreamRequest.authorization, 'Bearer local-contract-placeholder')
    assert.deepEqual(upstreamRequest.body.contents.map((item) => item.role), [
      'user',
      'model',
      'user',
    ])
    assert.equal(upstreamRequest.body.contents[2].parts[0].text, 'contract-question')
  } finally {
    await stopChild(child)
    await new Promise((resolve) => upstream.close(resolve))
  }
})
