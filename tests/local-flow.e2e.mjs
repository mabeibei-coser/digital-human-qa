import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import fs from 'node:fs'
import http from 'node:http'
import { once } from 'node:events'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { chromium } from 'playwright'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const chromePath = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'

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
  for (let attempt = 0; attempt < 50; attempt += 1) {
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

function createUpstream() {
  const requests = []
  const server = http.createServer((req, res) => {
    const chunks = []
    req.on('data', (chunk) => chunks.push(chunk))
    req.on('end', () => {
      requests.push({
        method: req.method,
        url: req.url,
        authorization: req.headers.authorization,
        body: JSON.parse(Buffer.concat(chunks).toString('utf8')),
      })
      res.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
      })
      res.write('data: {"candidates":[{"content":{"parts":[{"text":"first。"}]}}]}\n\n')
      setTimeout(() => {
        res.end('data: {"candidates":[{"content":{"parts":[{"text":"second。"}]}}]}\n\n')
      }, 700)
    })
  })
  return { server, requests }
}

async function preparePage(context, baseUrl, counters) {
  await context.addInitScript(() => {
    window.__D12_AUDIO_PLAYS__ = 0
    const nativePause = HTMLMediaElement.prototype.pause
    HTMLMediaElement.prototype.play = function play() {
      if (this.tagName === 'AUDIO' && this.src.startsWith('data:audio/mp3;base64,')) {
        window.__D12_AUDIO_PLAYS__ += 1
        setTimeout(() => this.dispatchEvent(new Event('ended')), 900)
      }
      return Promise.resolve()
    }
    HTMLMediaElement.prototype.pause = function pause() {
      try {
        nativePause.call(this)
      } catch {
        // Media is synthetic in this test.
      }
    }

    class FakeMediaRecorder {
      static isTypeSupported() {
        return true
      }

      constructor() {
        this.mimeType = 'audio/webm'
        this.state = 'inactive'
      }

      start() {
        this.state = 'recording'
      }

      stop() {
        this.state = 'inactive'
        const data = new Blob([new Uint8Array(4096)], { type: this.mimeType })
        this.ondataavailable?.({ data })
        this.onstop?.()
      }
    }

    Object.defineProperty(window, 'MediaRecorder', {
      configurable: true,
      value: FakeMediaRecorder,
    })
    Object.defineProperty(navigator, 'mediaDevices', {
      configurable: true,
      value: {
        getUserMedia: async () => ({ getTracks: () => [{ stop() {} }] }),
      },
    })
  })

  const page = await context.newPage()
  const errors = []
  page.on('pageerror', (error) => errors.push(error.message))
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text())
  })
  await page.route('**/api/tts', async (route) => {
    counters.tts += 1
    const request = route.request()
    assert.match(request.headers()['content-type'] || '', /application\/json/)
    const payload = request.postDataJSON()
    assert.equal(typeof payload.text, 'string')
    assert.ok(payload.text.length > 0)
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ audio: 'SUQzBAAAAAA=' }),
    })
  })
  await page.route('**/api/asr', async (route) => {
    counters.asr += 1
    assert.match(route.request().headers()['content-type'] || '', /audio\/webm/)
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ text: 'voice-contract-question' }),
    })
  })

  await page.goto(`${baseUrl}/a900/`, { waitUntil: 'networkidle' })
  await page.getByRole('button', { name: '3D 数字人演示', exact: true }).click()
  await page.locator('.chat__input').waitFor({ state: 'visible' })
  await page.evaluate(() => {
    const avatar = document.querySelector('.avatar')
    window.__D12_AVATAR_STATES__ = [avatar?.dataset.avatarTarget]
    new MutationObserver(() => {
      window.__D12_AVATAR_STATES__.push(avatar?.dataset.avatarTarget)
    }).observe(avatar, { attributes: true, attributeFilter: ['data-avatar-target'] })
  })
  return { page, errors }
}

async function assertAnswerFlow(page, question) {
  await page.locator('.chat__input').fill(question)
  await page.locator('.chat__send').click()
  const lastAnswer = page.locator('.msg--bot .msg__bubble').last()
  await assert.doesNotReject(async () => {
    await lastAnswer.filter({ hasText: 'first。' }).waitFor({ timeout: 5000 })
  })
  assert.doesNotMatch((await lastAnswer.textContent()) || '', /second/)
  await lastAnswer.filter({ hasText: 'first。second。' }).waitFor({ timeout: 5000 })
  await page.waitForFunction(() => window.__D12_AUDIO_PLAYS__ > 0, null, { timeout: 5000 })
  await page.waitForFunction(() => window.__D12_AVATAR_STATES__.includes('speaking'), null, {
    timeout: 5000,
  })
  await page.waitForFunction(
    () => document.querySelector('.avatar')?.dataset.avatarTarget === 'idle',
    null,
    { timeout: 5000 },
  )
  assert.equal((await lastAnswer.textContent())?.trim(), 'first。second。')
}

const upstream = createUpstream()
const upstreamPort = await listen(upstream.server)
const appPort = await freePort()
const child = spawn(process.execPath, ['server.js'], {
  cwd: root,
  env: {
    ...process.env,
    NODE_ENV: 'production',
    PORT: String(appPort),
    BANANAROUTER_API_KEY: 'local-e2e-placeholder',
    BANANAROUTER_BASE_URL: `http://127.0.0.1:${upstreamPort}`,
    BANANAROUTER_MODEL: 'gemini-test',
    VOLC_TTS_APP_KEY: '',
    VOLC_TTS_ACCESS_KEY: '',
    WECHAT_OFFICIAL_ACCOUNT_APPID: '',
    WECHAT_OFFICIAL_ACCOUNT_SECRET: '',
  },
  stdio: 'ignore',
  windowsHide: true,
})

let browser
try {
  const health = await waitForHealth(appPort, child)
  assert.deepEqual(
    { ok: health.ok, llm: health.llm, tts: health.tts, asr: health.asr },
    { ok: true, llm: true, tts: false, asr: false },
  )
  const baseUrl = `http://127.0.0.1:${appPort}`
  const wxResponse = await fetch(
    `${baseUrl}/api/wechat/js-config?url=${encodeURIComponent(`${baseUrl}/a900/`)}`,
  )
  assert.equal(wxResponse.status, 200)
  const wx = await wxResponse.json()
  assert.equal(wx.appId, 'FAKE_APPID')
  assert.equal(wx.signature, 'FAKE_SIGNATURE')
  const deniedWx = await fetch(
    `${baseUrl}/api/wechat/js-config?url=${encodeURIComponent('https://external.invalid/')}`,
  )
  assert.equal(deniedWx.status, 400)

  browser = await chromium.launch(
    fs.existsSync(chromePath) ? { headless: true, executablePath: chromePath } : { headless: true },
  )

  const desktopCounters = { tts: 0, asr: 0 }
  const desktopContext = await browser.newContext({ viewport: { width: 1440, height: 900 } })
  const desktop = await preparePage(desktopContext, baseUrl, desktopCounters)
  await assertAnswerFlow(desktop.page, 'desktop-contract-question')
  assert.ok(desktopCounters.tts >= 1)
  assert.equal(desktopCounters.asr, 0)
  assert.deepEqual(desktop.errors, [])
  assert.equal(
    await desktop.page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
    true,
  )
  await desktopContext.close()

  const mobileCounters = { tts: 0, asr: 0 }
  const mobileContext = await browser.newContext({
    viewport: { width: 393, height: 852 },
    isMobile: true,
    hasTouch: true,
    deviceScaleFactor: 2,
  })
  const mobile = await preparePage(mobileContext, baseUrl, mobileCounters)
  const mic = mobile.page.getByRole('button', { name: '语音提问' })
  await mic.click()
  await mobile.page.getByRole('button', { name: '结束录音' }).click()
  await mobile.page.locator('.msg--user .msg__bubble').last().filter({ hasText: 'voice-contract-question' }).waitFor()
  await mobile.page.locator('.msg--bot .msg__bubble').last().filter({ hasText: 'first。second。' }).waitFor()
  await mobile.page.waitForFunction(() => window.__D12_AUDIO_PLAYS__ > 0, null, { timeout: 5000 })
  await mobile.page.waitForFunction(
    () => document.querySelector('.avatar')?.dataset.avatarTarget === 'idle',
    null,
    { timeout: 5000 },
  )
  assert.equal(mobileCounters.asr, 1)
  assert.ok(mobileCounters.tts >= 1)
  assert.deepEqual(mobile.errors, [])
  assert.equal(
    await mobile.page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
    true,
  )
  await mobileContext.close()

  assert.equal(upstream.requests.length, 2)
  for (const request of upstream.requests) {
    assert.equal(request.method, 'POST')
    assert.equal(request.url, '/v1beta/models/gemini-test:streamGenerateContent?alt=sse')
    assert.equal(request.authorization, 'Bearer local-e2e-placeholder')
    assert.equal(request.body.contents.at(-1).role, 'user')
  }

  console.log(
    JSON.stringify({
      ok: true,
      desktop: { ttsCalls: desktopCounters.tts, asrCalls: desktopCounters.asr },
      mobile: { ttsCalls: mobileCounters.tts, asrCalls: mobileCounters.asr },
      wechatFake: true,
      upstreamCalls: upstream.requests.length,
    }),
  )
} finally {
  await browser?.close()
  await stopChild(child)
  await new Promise((resolve) => upstream.server.close(resolve))
}
