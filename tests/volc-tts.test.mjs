import assert from 'node:assert/strict';
import { test, beforeEach, afterEach } from 'node:test';

const savedEnv = { ...process.env };
Object.assign(process.env, { VOLC_TTS_APP_KEY: 'test-app', VOLC_TTS_ACCESS_KEY: 'test-token', VOLC_TTS_SPEAKER: 'zh_female_vv_uranus_bigtts', E2E_MOCK_MODE: 'false' });
const { synthesizeTTS } = await import('../lib/volc-tts.js');
const originalFetch = globalThis.fetch;
const originalError = console.error;
const originalWarn = console.warn;
beforeEach(() => {
  process.env.E2E_MOCK_MODE = 'false';
  console.error = () => {};
  console.warn = () => {};
});
afterEach(() => {
  globalThis.fetch = originalFetch;
  console.error = originalError;
  console.warn = originalWarn;
});
process.on('exit', () => { Object.assign(process.env, savedEnv); });
const response = () => new Response([
  JSON.stringify({ code: 0, data: Buffer.from('fixt').toString('base64') }),
  JSON.stringify({ code: 0, data: null, sentence: {} }),
  JSON.stringify({ code: 0, data: Buffer.from('ure-mp3').toString('base64') }),
  JSON.stringify({ code: 20000000, data: null }),
].join('\r\n'));

test('V3 auth + Uranus resource and independently padded MP3 chunks', async () => {
  globalThis.fetch = async (url, init) => {
    assert.equal(url, 'https://openspeech.bytedance.com/api/v3/tts/unidirectional');
    const headers = new Headers(init.headers);
    assert.equal(headers.get('X-Api-App-Id'), 'test-app');
    assert.equal(headers.get('X-Api-Access-Key'), 'test-token');
    assert.equal(headers.get('X-Api-Resource-Id'), 'seed-tts-2.0');
    const body = JSON.parse(init.body);
    assert.equal(body.req_params.text, '测试题目');
    assert.equal(body.req_params.speaker, 'zh_female_vv_uranus_bigtts');
    assert.equal(body.req_params.audio_params.format, 'mp3');
    return response();
  };
  assert.equal(await synthesizeTTS('测试题目', 0), Buffer.from('fixture-mp3').toString('base64'));
});
for (const [name, body, status] of [
  ['truncated', '{"code":0,"data":"YQ=="}', 200],
  ['provider error after audio', '{"code":0,"data":"YQ=="}\n{"code":55000000}', 200],
  ['HTTP error', '{"code":0,"data":"YQ=="}\n{"code":20000000}', 503],
  ['empty success', '{"code":20000000}', 200],
  ['invalid JSON', 'invalid', 200],
]) {
  test(`failure stays empty: ${name}`, async () => {
    globalThis.fetch = async () => new Response(body, { status });
    assert.equal(await synthesizeTTS('测试', 0), '');
  });
}
test('mock mode never calls provider', async () => {
  process.env.E2E_MOCK_MODE = 'true';
  let calls = 0;
  globalThis.fetch = async () => { calls++; return response(); };
  assert.equal(await synthesizeTTS('测试', 0), '');
  assert.equal(calls, 0);
});

test('preserves bounded HTTP 429 retry', async (t) => {
  let calls = 0;
  const realTimeout = globalThis.setTimeout;
  t.mock.method(globalThis, 'setTimeout', (fn, ms, ...args) => realTimeout(fn, ms < 2000 ? 0 : ms, ...args));
  globalThis.fetch = async () => ++calls === 1 ? new Response('', { status: 429 }) : response();
  assert.equal(await synthesizeTTS('测试', 1), Buffer.from('fixture-mp3').toString('base64'));
  assert.equal(calls, 2);
});

test('welcome generation preserves custom speed', async () => {
  globalThis.fetch = async (_url, init) => {
    assert.equal(JSON.parse(init.body).req_params.audio_params.speech_rate, 20);
    return response();
  };
  assert.equal(await synthesizeTTS('测试', 0, { speechRate: 20 }), Buffer.from('fixture-mp3').toString('base64'));
});
