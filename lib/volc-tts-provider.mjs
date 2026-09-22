import { randomUUID } from "node:crypto";

export class TtsHttpError extends Error {
  /** @param {number} status */
  constructor(status) {
    super(`TTS HTTP ${status}`);
    this.status = status;
  }
}

/**
 * Shared by runtime questions and the static audio generator.
 * @param {string} text
 * @param {{ appKey: string, accessKey: string, speaker: string, signal?: AbortSignal, speechRate?: number }} options
 */
export async function requestSpeech(text, { appKey, accessKey, speaker, signal, speechRate = 0 }) {
  const res = await fetch("https://openspeech.bytedance.com/api/v3/tts/unidirectional", {
    method: "POST",
    signal,
    headers: {
      "Content-Type": "application/json",
      "X-Api-App-Id": appKey,
      "X-Api-Access-Key": accessKey,
      // The configured Uranus voice belongs to TTS 2.0.
      "X-Api-Resource-Id": "seed-tts-2.0",
      "X-Api-Request-Id": randomUUID(),
    },
    body: JSON.stringify({
      user: { uid: randomUUID() },
      req_params: {
        text,
        speaker,
        audio_params: { format: "mp3", sample_rate: 24000, speech_rate: speechRate },
      },
    }),
  });
  if (!res.ok) throw new TtsHttpError(res.status);

  // HTTP chunks may split JSON lines. Read the complete response before parsing.
  const chunks = [];
  let complete = false;
  for (const line of (await res.text()).split(/\r?\n/)) {
    if (!line.trim()) continue;
    const data = JSON.parse(line);
    if (data.code === 20000000) {
      complete = true;
    } else if (data.code !== 0) {
      throw new Error(`TTS provider error ${data.code}`);
    }
    if (data.data) chunks.push(Buffer.from(data.data, "base64"));
  }
  const audio = Buffer.concat(chunks);
  if (!complete || !audio.length) throw new Error("TTS incomplete or empty audio");
  return audio;
}
