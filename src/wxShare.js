import wx from 'weixin-js-sdk'

const API_BASE = import.meta.env.BASE_URL
const JS_API_LIST = [
  'updateAppMessageShareData',
  'updateTimelineShareData',
  'onMenuShareAppMessage',
  'onMenuShareTimeline',
]

export function isWeChatBrowser() {
  return /micromessenger/i.test(navigator.userAgent)
}

function isIOSWeChat() {
  return isWeChatBrowser() && /iphone|ipad|ipod/i.test(navigator.userAgent)
}

function isWxDebugEnabled() {
  const params = new URLSearchParams(window.location.search)
  return params.get('wxdebug') === '1' || params.get('shareDebug') === '1'
}

async function fetchJsConfig(url) {
  const res = await fetch(`${API_BASE}api/wechat/js-config?url=${encodeURIComponent(url)}`, {
    credentials: 'include',
  })
  if (!res.ok) return null
  return res.json().catch(() => null)
}

function getSignUrlCandidates() {
  const current = window.location.href.split('#')[0]
  const urls = [current]

  // iOS WeChat may validate against the first URL loaded into the WebView.
  // If nginx redirected /a900 -> /a900/, retrying without the trailing slash
  // avoids an otherwise invisible "invalid signature" failure.
  if (isIOSWeChat()) {
    try {
      const u = new URL(current)
      if (u.pathname.length > 1 && u.pathname.endsWith('/')) {
        const noSlash = new URL(current)
        noSlash.pathname = noSlash.pathname.replace(/\/$/, '')
        urls.push(noSlash.toString())
      } else if (u.pathname && !u.pathname.endsWith('/')) {
        const withSlash = new URL(current)
        withSlash.pathname = `${withSlash.pathname}/`
        urls.push(withSlash.toString())
      }
    } catch {
      // Keep the current URL as the only candidate.
    }
  }

  return Array.from(new Set(urls))
}

function rememberWxShareState(state) {
  window.__A900_WX_SHARE__ = {
    ...(window.__A900_WX_SHARE__ || {}),
    ...state,
    updatedAt: new Date().toISOString(),
  }
  if (isWxDebugEnabled()) console.info('[wxShare]', window.__A900_WX_SHARE__)
}

function applyShareData(share) {
  wx.updateAppMessageShareData(share)
  wx.updateTimelineShareData({ title: share.title, link: share.link, imgUrl: share.imgUrl })
  if (typeof wx.onMenuShareAppMessage === 'function') wx.onMenuShareAppMessage(share)
  if (typeof wx.onMenuShareTimeline === 'function') {
    wx.onMenuShareTimeline({ title: share.title, link: share.link, imgUrl: share.imgUrl })
  }
}

export async function initWxShare({ title, desc, link, imgUrl }) {
  if (!isWeChatBrowser()) return
  if (imgUrl) {
    try {
      const im = new Image()
      im.src = imgUrl
    } catch {
      // noop
    }
  }

  const debug = isWxDebugEnabled()
  const share = { title, desc, link, imgUrl }
  const signUrls = getSignUrlCandidates()
  let activeAttempt = 0

  async function configure(index) {
    const signUrl = signUrls[index]
    if (!signUrl) return
    const attempt = ++activeAttempt

    try {
      rememberWxShareState({ status: 'fetching-config', signUrl, link, imgUrl })
      const cfg = await fetchJsConfig(signUrl)
      if (!cfg || !cfg.signature) {
        rememberWxShareState({ status: 'missing-signature', signUrl })
        return
      }

      wx.ready(() => {
        if (attempt !== activeAttempt) return
        applyShareData(share)
        rememberWxShareState({ status: 'ready', signUrl })
      })

      wx.error((err) => {
        if (attempt !== activeAttempt) return
        const message = err?.errMsg || String(err)
        rememberWxShareState({ status: 'error', signUrl, message })
        if (/invalid signature/i.test(message) && signUrls[index + 1]) {
          configure(index + 1)
          return
        }
        console.error('[wxShare] config failed:', message)
      })

      wx.config({
        debug,
        appId: cfg.appId,
        timestamp: Number(cfg.timestamp),
        nonceStr: cfg.nonceStr,
        signature: cfg.signature,
        jsApiList: JS_API_LIST,
      })
    } catch (err) {
      rememberWxShareState({ status: 'exception', signUrl, message: err?.message || String(err) })
      console.error('[wxShare] init failed:', err)
    }
  }

  configure(0)
}
