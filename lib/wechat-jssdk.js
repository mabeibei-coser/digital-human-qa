// 微信 JS-SDK 网页分享签名 —— 让 A900 页面在微信里「···→ 发送给朋友」时出卡片。
//
// 用途：前端 wx.config 需要 {appId, timestamp, nonceStr, signature}，签名只能在
// 服务端算（要拿公众号 access_token → jsapi_ticket，secret 不能下发到前端）。
//
// 流程：
//   getAccessToken()  -- stable_token 接口拿 token（内存缓存 ~7200s）
//   getJsapiTicket()  -- 用 token 拿 jsapi_ticket（内存缓存 ~7200s）
//   buildJsConfig(url) -- 拼 string1 → sha1 → 返回 wx.config 四件套
//
// fake mode（env 不全，本地）：返回占位对象、不抛错。JS-SDK 本地本就跑不起来，
// 只在微信内生效；本地只验接口形态。配齐 WECHAT_OFFICIAL_ACCOUNT_APPID/SECRET 即切真。
//
// 为什么用 stable_token 而不是经典 cgi-bin/token：
//   经典 token 全公众号唯一，谁刷新就让别人失效；A900 与 ATA100 共用同一公众号也拿
//   token，两台会互相把对方刷掉 → 每 2 小时间歇性 40001。stable_token 多个调用方
//   各自有效、互不踢，从根上避开。

import crypto from "node:crypto";

const STABLE_TOKEN_URL = "https://api.weixin.qq.com/cgi-bin/stable_token";
const JSAPI_TICKET_URL = "https://api.weixin.qq.com/cgi-bin/ticket/getticket";

/** 公众号凭证是否齐全（决定是否 fake mode）。复用 OAuth 同一对 env。 */
export function isJssdkReady() {
  return (
    !!process.env.WECHAT_OFFICIAL_ACCOUNT_APPID &&
    !!process.env.WECHAT_OFFICIAL_ACCOUNT_SECRET
  );
}

// ── 内存缓存（单 pm2 进程足够；提前 300s 过期防边界）──
let tokenCache = { value: null, expireAt: 0 };
let ticketCache = { value: null, expireAt: 0 };
const SAFETY_MS = 300 * 1000;

/** 拿公众号 access_token（stable_token，带缓存）。 */
async function getAccessToken() {
  if (tokenCache.value && Date.now() < tokenCache.expireAt) {
    return tokenCache.value;
  }
  const resp = await fetch(STABLE_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      grant_type: "client_credential",
      appid: process.env.WECHAT_OFFICIAL_ACCOUNT_APPID,
      secret: process.env.WECHAT_OFFICIAL_ACCOUNT_SECRET,
      force_refresh: false,
    }),
  });
  if (!resp.ok) {
    throw new Error(`stable_token HTTP 失败 status=${resp.status}`);
  }
  const data = await resp.json();
  if (data.errcode) {
    // 40164 = 调用 IP 不在公众号 IP 白名单（最常见的拿不到 token 原因）
    throw new Error(`stable_token 失败 errcode=${data.errcode} errmsg=${data.errmsg}`);
  }
  tokenCache = {
    value: data.access_token,
    expireAt: Date.now() + data.expires_in * 1000 - SAFETY_MS,
  };
  return tokenCache.value;
}

/** 拿 jsapi_ticket（带缓存；ticket 有每日调用次数上限，必须缓存）。 */
async function getJsapiTicket() {
  if (ticketCache.value && Date.now() < ticketCache.expireAt) {
    return ticketCache.value;
  }
  const token = await getAccessToken();
  const params = new URLSearchParams({ access_token: token, type: "jsapi" });
  const resp = await fetch(`${JSAPI_TICKET_URL}?${params.toString()}`, { method: "GET" });
  if (!resp.ok) {
    throw new Error(`jsapi_ticket HTTP 失败 status=${resp.status}`);
  }
  const data = await resp.json();
  if (data.errcode && data.errcode !== 0) {
    throw new Error(`jsapi_ticket 失败 errcode=${data.errcode} errmsg=${data.errmsg}`);
  }
  ticketCache = {
    value: data.ticket,
    expireAt: Date.now() + data.expires_in * 1000 - SAFETY_MS,
  };
  return ticketCache.value;
}

/**
 * 为指定页面 URL 生成 wx.config 四件套。
 * @param {string} rawUrl 当前页面完整 URL（带不带 # 都行，内部会去掉 #）
 * @returns {Promise<{appId:string,timestamp:number,nonceStr:string,signature:string}>}
 */
export async function buildJsConfig(rawUrl) {
  const url = String(rawUrl || "").split("#")[0]; // 签名只认 # 前部分
  const nonceStr = crypto.randomBytes(8).toString("hex");
  const timestamp = Math.floor(Date.now() / 1000);

  if (!isJssdkReady()) {
    // fake mode：返回占位，前端在微信里会 config 失败但不影响其它功能；本地只验形态
    console.warn("[wechat-jssdk] fake mode: env 不全。配齐公众号 appid/secret 即可切真。");
    return { appId: "FAKE_APPID", timestamp, nonceStr, signature: "FAKE_SIGNATURE" };
  }

  const ticket = await getJsapiTicket();
  // 字段名小写、按字典序拼接，原值不做 URL 转义
  const string1 = `jsapi_ticket=${ticket}&noncestr=${nonceStr}&timestamp=${timestamp}&url=${url}`;
  const signature = crypto.createHash("sha1").update(string1).digest("hex");

  return {
    appId: process.env.WECHAT_OFFICIAL_ACCOUNT_APPID,
    timestamp,
    nonceStr,
    signature,
  };
}
