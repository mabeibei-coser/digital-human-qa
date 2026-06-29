/**
 * 微信 JS-SDK 网页分享 —— 让页面在微信里「···→ 发送给朋友/朋友圈」时出卡片。
 * 仅在微信内置浏览器生效；其它环境直接跳过，不影响页面。
 * 后端签名见 server.js `/api/wechat/js-config` + lib/wechat-jssdk.js。
 */
import wx from 'weixin-js-sdk'

const API_BASE = import.meta.env.BASE_URL // 子路径部署：'/a900/'，本地 '/'

/** 是否微信内置浏览器 */
export function isWeChatBrowser() {
  return /micromessenger/i.test(navigator.userAgent)
}

/** 向后端取 wx.config 四件套（按当前页 URL 签名）。 */
async function fetchJsConfig(url) {
  const res = await fetch(`${API_BASE}api/wechat/js-config?url=${encodeURIComponent(url)}`, {
    credentials: 'include',
  })
  if (!res.ok) return null
  return res.json().catch(() => null)
}

/**
 * 配置微信分享卡片。
 * @param {{title:string, desc:string, link:string, imgUrl:string}} opts
 *   link/imgUrl 必须是完整 https 绝对地址；imgUrl 需公网可访问的方形图。
 */
export async function initWxShare({ title, desc, link, imgUrl }) {
  if (!isWeChatBrowser()) return
  // 预热分享缩略图：微信是异步拉缩略图的，图没拉完就分享 → 缩略图空白。
  // 页面一打开就让微信 WebView 先把图缓存好，用户首次分享即可显示。
  if (imgUrl) { try { const im = new Image(); im.src = imgUrl } catch { /* noop */ } }
  try {
    // 签名 URL 必须去掉 # 后缀，且等于地址栏 URL（invalid signature 头号原因）
    const signUrl = window.location.href.split('#')[0]
    const cfg = await fetchJsConfig(signUrl)
    if (!cfg || !cfg.signature) return

    wx.config({
      debug: false, // 真机排错时临时改 true：微信里会弹 config:ok / 错误详情
      appId: cfg.appId,
      timestamp: Number(cfg.timestamp),
      nonceStr: cfg.nonceStr,
      signature: cfg.signature,
      jsApiList: [
        'updateAppMessageShareData', // 新版·分享给朋友
        'updateTimelineShareData',   // 新版·分享到朋友圈
        'onMenuShareAppMessage',     // 旧版·朋友（老客户端兼容）
        'onMenuShareTimeline',       // 旧版·朋友圈
      ],
    })

    const share = { title, desc, link, imgUrl }
    wx.ready(() => {
      wx.updateAppMessageShareData(share)
      wx.updateTimelineShareData({ title, link, imgUrl }) // 朋友圈无 desc
      // 旧客户端兼容（新版客户端会忽略）
      if (typeof wx.onMenuShareAppMessage === 'function') wx.onMenuShareAppMessage(share)
      if (typeof wx.onMenuShareTimeline === 'function') {
        wx.onMenuShareTimeline({ title, link, imgUrl })
      }
    })
    wx.error((err) => console.error('[wxShare] config 失败:', err?.errMsg || err))
  } catch (err) {
    console.error('[wxShare] 初始化失败:', err)
  }
}
