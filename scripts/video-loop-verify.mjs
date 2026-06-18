import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { PNG } from 'pngjs'
import { chromium } from 'playwright'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const root = path.resolve(__dirname, '..')
const outputDir = path.join(root, 'output', 'video-loop-verification')
const defaultChromePath = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'

const args = new Map(
  process.argv.slice(2).map((arg) => {
    const [rawKey, ...rest] = arg.replace(/^--/, '').split('=')
    return [rawKey, rest.join('=') || 'true']
  }),
)

const baseUrl = args.get('url') || process.env.A900_URL || 'http://127.0.0.1:3010/'
const rounds = Number(args.get('rounds') || process.env.A900_LOOP_ROUNDS || 50)
const interval = Number(args.get('interval') || process.env.A900_LOOP_INTERVAL || 420)
const sampleMs = Number(args.get('sampleMs') || process.env.A900_LOOP_SAMPLE_MS || 110)
const variant = args.get('variant') || process.env.A900_LOOP_VARIANT || 'default'
const chromePath = args.get('chromePath') || process.env.CHROME_PATH || defaultChromePath

const viewports = [
  { name: 'desktop', width: 1440, height: 900, isMobile: false },
  { name: 'mobile', width: 393, height: 852, isMobile: true },
]

function loopUrl(viewport) {
  const url = new URL(baseUrl)
  url.searchParams.set('avatarLoop', '1')
  url.searchParams.set('rounds', String(rounds))
  url.searchParams.set('interval', String(interval))
  url.searchParams.set('variant', variant)
  url.searchParams.set('viewportName', viewport.name)
  return url.toString()
}

function analyzePng(buffer) {
  const png = PNG.sync.read(buffer)
  let black = 0
  let white = 0
  let transparent = 0
  let ink = 0
  let lumaSum = 0
  const total = png.width * png.height

  for (let i = 0; i < png.data.length; i += 4) {
    const r = png.data[i]
    const g = png.data[i + 1]
    const b = png.data[i + 2]
    const a = png.data[i + 3]
    const luma = 0.2126 * r + 0.7152 * g + 0.0722 * b
    lumaSum += luma
    if (a < 8) transparent += 1
    if (luma < 12) black += 1
    if (luma > 246 && Math.abs(r - g) < 8 && Math.abs(g - b) < 8) white += 1
    if (a > 8 && !(luma > 238 && Math.abs(r - g) < 12 && Math.abs(g - b) < 12)) ink += 1
  }

  return {
    width: png.width,
    height: png.height,
    avgLuma: lumaSum / total,
    blackRatio: black / total,
    whiteRatio: white / total,
    transparentRatio: transparent / total,
    inkRatio: ink / total,
  }
}

async function sample(page, stage, index, viewportName) {
  const [state, rect] = await Promise.all([
    page.evaluate(() => {
      const avatar = document.querySelector('.avatar')
      const clips = [...document.querySelectorAll('.avatar__clip')].map((video) => {
        const style = getComputedStyle(video)
        const key = [...video.classList].find((name) => name.startsWith('avatar__clip--'))?.replace('avatar__clip--', '')
        return {
          key,
          className: video.className,
          src: video.currentSrc || video.src,
          readyState: video.readyState,
          paused: video.paused,
          ended: video.ended,
          currentTime: video.currentTime,
          videoWidth: video.videoWidth,
          videoHeight: video.videoHeight,
          opacity: Number(style.opacity),
          zIndex: style.zIndex,
        }
      })
      return {
        loop: window.__A900_AVATAR_LOOP__ || null,
        target: avatar?.dataset.avatarTarget || null,
        shown: avatar?.dataset.avatarShown || null,
        ready: avatar?.dataset.avatarReady || null,
        visibleClipCount: clips.filter((clip) => clip.opacity > 0.02).length,
        clips,
      }
    }),
    stage.boundingBox(),
  ])
  const clip = {
    x: Math.max(0, rect.x),
    y: Math.max(0, rect.y),
    width: Math.max(1, Math.min(rect.width, page.viewportSize().width - Math.max(0, rect.x))),
    height: Math.max(1, Math.min(rect.height, page.viewportSize().height - Math.max(0, rect.y))),
  }
  const buffer = await page.screenshot({ type: 'png', clip })

  const pixels = analyzePng(buffer)
  return { index, viewportName, at: Date.now(), state, rect, pixels, buffer }
}

function inspectSample(sampleItem, baselineRect) {
  const failures = []
  const { state, pixels, rect } = sampleItem
  const shownClip = state.clips.find((clip) => clip.className.includes('is-shown'))
  const visibleReadyClip = state.clips.find((clip) => clip.opacity > 0.02 && clip.readyState >= 2 && clip.videoWidth > 0)

  if (!shownClip) failures.push('no shown video layer')
  if (!visibleReadyClip) failures.push('no visible decoded video')
  if (state.visibleClipCount < 1) failures.push('all video layers invisible')
  if (shownClip && shownClip.readyState < 2) failures.push(`shown layer not drawable: ${shownClip.className}`)
  if (shownClip && shownClip.paused && !shownClip.ended) failures.push(`shown layer paused: ${shownClip.className}`)
  if (pixels.blackRatio > 0.28) failures.push(`black frame ratio ${(pixels.blackRatio * 100).toFixed(1)}%`)
  if (pixels.transparentRatio > 0.01) failures.push(`transparent frame ratio ${(pixels.transparentRatio * 100).toFixed(1)}%`)
  if (pixels.inkRatio < 0.018) failures.push(`likely blank/white frame ink ratio ${(pixels.inkRatio * 100).toFixed(2)}%`)

  if (baselineRect && rect) {
    const dx = Math.abs(rect.x - baselineRect.x)
    const dy = Math.abs(rect.y - baselineRect.y)
    const dw = Math.abs(rect.width - baselineRect.width)
    const dh = Math.abs(rect.height - baselineRect.height)
    if (dx > 1 || dy > 1 || dw > 1 || dh > 1) {
      failures.push(`stage layout shifted dx=${dx.toFixed(2)} dy=${dy.toFixed(2)} dw=${dw.toFixed(2)} dh=${dh.toFixed(2)}`)
    }
  }

  return failures
}

function inspectMotion(previous, current) {
  if (!previous) return []
  const failures = []
  const prevShown = previous.state.clips.find((clip) => clip.className.includes('is-shown'))
  const currShown = current.state.clips.find((clip) => clip.className.includes('is-shown'))
  if (!prevShown || !currShown) return failures
  if (prevShown.key !== currShown.key) return failures
  if (currShown.ended || currShown.paused) return failures

  const elapsedMs = current.at - previous.at
  const delta = currShown.currentTime - prevShown.currentTime
  const wrappedLoop = delta < -0.25
  if (elapsedMs >= 90 && !wrappedLoop && Math.abs(delta) < 0.012) {
    failures.push(`shown layer time stalled: ${currShown.key} dt=${elapsedMs}ms delta=${delta.toFixed(4)}s`)
  }
  return failures
}

async function runViewport(browser, viewport) {
  const context = await browser.newContext({
    viewport: { width: viewport.width, height: viewport.height },
    isMobile: viewport.isMobile,
    deviceScaleFactor: viewport.isMobile ? 2 : 1,
    hasTouch: viewport.isMobile,
  })
  const page = await context.newPage()
  page.on('console', (msg) => {
    if (msg.type() === 'error') console.error(`[browser:${viewport.name}]`, msg.text())
  })

  await page.goto(loopUrl(viewport), { waitUntil: 'networkidle' })
  const stage = page.locator('.avatar-stage')
  await stage.waitFor({ state: 'visible', timeout: 10000 })
  await page.waitForFunction(() => window.__A900_AVATAR_LOOP__?.enabled, null, { timeout: 10000 })
  await page.evaluate(() => document.fonts?.ready || Promise.resolve())
  await page.waitForTimeout(650)

  const started = Date.now()
  const samples = []
  const failures = []
  let baselineRect = null
  let failureShotSaved = false

  while (true) {
    const previous = samples[samples.length - 1]
    const item = await sample(page, stage, samples.length, viewport.name)
    baselineRect ||= item.rect
    samples.push(item)

    const sampleFailures = [...inspectSample(item, baselineRect), ...inspectMotion(previous, item)]
    if (sampleFailures.length) {
      failures.push({
        index: item.index,
        loop: item.state.loop,
        target: item.state.target,
        shown: item.state.shown,
        pixels: item.pixels,
        failures: sampleFailures,
      })
      if (!failureShotSaved) {
        fs.writeFileSync(path.join(outputDir, `${viewport.name}-first-failure.png`), item.buffer)
        failureShotSaved = true
      }
    }

    const loop = item.state.loop
    if (loop?.done) break
    if (Date.now() - started > Math.max(45000, rounds * interval * 4)) {
      failures.push({ index: item.index, failures: ['loop timeout'], loop })
      break
    }
    await page.waitForTimeout(sampleMs)
  }

  const finalRect = await stage.boundingBox()
  const finalClip = {
    x: Math.max(0, finalRect.x),
    y: Math.max(0, finalRect.y),
    width: Math.max(1, Math.min(finalRect.width, page.viewportSize().width - Math.max(0, finalRect.x))),
    height: Math.max(1, Math.min(finalRect.height, page.viewportSize().height - Math.max(0, finalRect.y))),
  }
  const finalShot = await page.screenshot({ type: 'png', clip: finalClip })
  fs.writeFileSync(path.join(outputDir, `${viewport.name}-final.png`), finalShot)
  await context.close()

  return {
    viewport: viewport.name,
    width: viewport.width,
    height: viewport.height,
    samples: samples.length,
    failures,
    firstSample: summarizeSample(samples[0]),
    lastSample: summarizeSample(samples[samples.length - 1]),
  }
}

function summarizeSample(item) {
  if (!item) return null
  return {
    index: item.index,
    loop: item.state.loop,
    target: item.state.target,
    shown: item.state.shown,
    ready: item.state.ready,
    pixels: item.pixels,
    rect: item.rect,
  }
}

async function main() {
  fs.mkdirSync(outputDir, { recursive: true })
  const launchOptions = fs.existsSync(chromePath)
    ? { headless: true, executablePath: chromePath }
    : { headless: true }
  const browser = await chromium.launch(launchOptions)

  const results = []
  for (const viewport of viewports) {
    results.push(await runViewport(browser, viewport))
  }

  await browser.close()

  const report = {
    ok: results.every((result) => result.failures.length === 0),
    checkedAt: new Date().toISOString(),
    baseUrl,
    rounds,
    interval,
    sampleMs,
    variant,
    results,
  }

  const reportPath = path.join(outputDir, `report-${Date.now()}.json`)
  fs.writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`)
  console.log(JSON.stringify({ ok: report.ok, reportPath, results: results.map((r) => ({ viewport: r.viewport, samples: r.samples, failures: r.failures.length })) }, null, 2))

  if (!report.ok) process.exitCode = 1
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
