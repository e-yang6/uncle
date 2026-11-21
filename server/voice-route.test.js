import { test } from "node:test";
import assert from "node:assert/strict";
import { createApp } from "./index.js";

async function withServer(app, fn) {
  const server = app.listen(0, "127.0.0.1");
  await new Promise((resolve, reject) => {
    server.once("listening", resolve);
    server.once("error", reject);
  });
  try {
    await fn(`http://127.0.0.1:${server.address().port}`);
  } finally {
    server.close();
  }
}

// A fake voice so these tests never call ElevenLabs (or spend credits).
const fakeSpeak = async () => {
  const samples = new Float32Array(24000);
  for (let n = 0; n < samples.length; n++) samples[n] = 0.3 * Math.sin((2 * Math.PI * 150 * n) / 24000);
  return { samples, sampleRate: 24000, ttfbMs: 1, totalMs: 2 };
};

test("voice test route returns a WAV, longer when aged, and caches the voice call", async () => {
  let calls = 0;
  const app = createApp({ speakFn: async (...a) => (calls++, fakeSpeak(...a)) });
  await withServer(app, async (base) => {
    const raw = await fetch(`${base}/api/voice/test?raw=1`);
    assert.equal(raw.status, 200);
    assert.equal(raw.headers.get("content-type"), "audio/wav");
    const rawLen = (await raw.arrayBuffer()).byteLength;

    const aged = await fetch(`${base}/api/voice/test?strength=1`);
    assert.equal(aged.status, 200);
    assert.equal(aged.headers.get("x-tts-cached"), "true");
    const agedLen = (await aged.arrayBuffer()).byteLength;
    assert.ok(agedLen > rawLen, "aged speech is slower, so the file is longer");
    assert.equal(calls, 1, "second request reuses the first voice call");
  });
});

test("voice route says the voice is off, with a 503, when there is no key", async () => {
  const app = createApp({
    speakFn: async () => {
      throw new Error("voice is off: set ELEVENLABS_API_KEY");
    },
  });
  await withServer(app, async (base) => {
    const res = await fetch(`${base}/api/voice/test`);
    assert.equal(res.status, 503);
    assert.match((await res.json()).error, /voice is off/);
  });
});
