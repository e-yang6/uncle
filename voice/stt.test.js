import { test } from "node:test";
import assert from "node:assert/strict";
import { WebSocketServer } from "ws";
import { createSttSession } from "./stt.js";

// A fake ElevenLabs speech-to-text server that records what it receives.
async function fakeEleven() {
  const wss = new WebSocketServer({ host: "127.0.0.1", port: 0 });
  await new Promise((r) => wss.once("listening", r));
  const seen = { url: null, headers: null, messages: [] };
  let socket;
  wss.on("connection", (ws, req) => {
    socket = ws;
    seen.url = new URL(req.url, "http://x");
    seen.headers = req.headers;
    ws.on("message", (raw) => seen.messages.push(JSON.parse(raw.toString())));
  });
  return { wss, seen, url: `ws://127.0.0.1:${wss.address().port}/v1/speech-to-text/realtime`, push: (m) => socket.send(JSON.stringify(m)) };
}
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

test("connects with the key and the right settings, sends chunks in ElevenLabs' format, even ones sent before it opened", async () => {
  const f = await fakeEleven();
  const s = createSttSession({ apiKey: "k-123", baseUrl: f.url, onTranscript() {} });
  s.send("AAAA", 16000); // sent immediately, before the socket is open: must be held, not lost
  await wait(150);
  s.send("BBBB", 16000);
  await wait(100);
  assert.equal(f.seen.headers["xi-api-key"], "k-123");
  assert.equal(f.seen.url.searchParams.get("commit_strategy"), "vad", "ElevenLabs decides when speech ends");
  assert.equal(f.seen.url.searchParams.get("audio_format"), "pcm_16000");
  assert.ok(Number(f.seen.url.searchParams.get("vad_silence_threshold_secs")) > 0);
  assert.deepEqual(f.seen.messages, [
    { message_type: "input_audio_chunk", audio_base_64: "AAAA", commit: false, sample_rate: 16000 },
    { message_type: "input_audio_chunk", audio_base_64: "BBBB", commit: false, sample_rate: 16000 },
  ]);
  s.close();
  f.wss.close();
});

test("committed text becomes a transcript; partials, empty text and unknown messages do not; errors are reported", async () => {
  const f = await fakeEleven();
  const got = { done: [], partial: [], errors: [], closed: 0 };
  const s = createSttSession({
    apiKey: "k", baseUrl: f.url,
    onTranscript: (t) => got.done.push(t), onPartial: (t) => got.partial.push(t),
    onError: (e) => got.errors.push(e), onClose: () => got.closed++,
  });
  s.send("AAAA");
  await wait(150);
  f.push({ message_type: "session_started", session_id: "x", config: {} });
  f.push({ message_type: "partial_transcript", text: "Did we" });
  f.push({ message_type: "committed_transcript", text: "  Did we buy a house?  " });
  f.push({ message_type: "committed_transcript", text: "   " });
  f.push({ message_type: "something_new", text: "ignored" });
  f.push({ message_type: "quota_exceeded", error: "no credits" });
  await wait(150);
  assert.deepEqual(got.done, ["Did we buy a house?"]);
  assert.deepEqual(got.partial, ["Did we"]);
  assert.deepEqual(got.errors, ["quota_exceeded: no credits"]);
  s.close();
  await wait(100);
  assert.equal(got.closed, 1);
  assert.equal(s.send("late"), false, "no sending after close");
  f.wss.close();
});

test("no key means speech-to-text is off, with a clear message", () => {
  assert.throws(() => createSttSession({ apiKey: "", onTranscript() {} }), /is off/);
});
