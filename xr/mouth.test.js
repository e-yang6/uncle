import { test } from "node:test";
import assert from "node:assert/strict";
import { analyzeFrame, mouthShape, createSmoother } from "./mouth.js";
import { decodePcm16 } from "./pcm.js";
import { nextStartTime } from "./player.js";

const RATE = 24000;
function tone(freq, amp, n = 1024) {
  return Float32Array.from({ length: n }, (_, i) => amp * Math.sin((2 * Math.PI * freq * i) / RATE));
}

test("silence keeps the mouth closed", () => {
  const m = mouthShape(analyzeFrame(new Float32Array(1024), RATE));
  assert.equal(m.jaw, 0);
  assert.equal(m.wide, 0);
  assert.equal(m.round, 0);
});

test("a loud low tone opens the jaw and rounds the mouth", () => {
  const m = mouthShape(analyzeFrame(tone(200, 0.5), RATE));
  assert.ok(m.jaw > 0.7, `jaw ${m.jaw}`);
  assert.ok(m.round > m.wide, `round ${m.round} wide ${m.wide}`);
});

test("a loud high tone opens the jaw and widens the mouth", () => {
  const m = mouthShape(analyzeFrame(tone(3000, 0.5), RATE));
  assert.ok(m.jaw > 0.7, `jaw ${m.jaw}`);
  assert.ok(m.wide > m.round, `wide ${m.wide} round ${m.round}`);
});

test("a quiet sound opens the jaw less than a loud one", () => {
  const quiet = mouthShape(analyzeFrame(tone(500, 0.01), RATE)).jaw;
  const loud = mouthShape(analyzeFrame(tone(500, 0.5), RATE)).jaw;
  assert.ok(quiet < loud, `quiet ${quiet} loud ${loud}`);
});

test("the smoother opens faster than it closes", () => {
  const s = createSmoother({ attack: 0.03, release: 0.12 });
  const up = s.step(1, 0.03);
  s.reset(1);
  const down = 1 - s.step(0, 0.03);
  assert.ok(up > down, `up ${up} down ${down}`);
  assert.ok(up > 0 && up < 1);
});

test("16-bit little-endian PCM decodes to -1..1", () => {
  // samples: 0, 16384, -32768, 32767
  const bytes = Uint8Array.from([0x00, 0x00, 0x00, 0x40, 0x00, 0x80, 0xff, 0x7f]);
  const b64 = Buffer.from(bytes).toString("base64");
  const out = decodePcm16(b64);
  assert.equal(out.length, 4);
  assert.equal(out[0], 0);
  assert.equal(out[1], 0.5);
  assert.equal(out[2], -1);
  assert.ok(Math.abs(out[3] - 1) < 1e-4);
});

test("queued sentences play back to back, never in the past", () => {
  assert.equal(nextStartTime(10, 12.5), 12.5); // queued audio still playing: start right after it
  assert.equal(nextStartTime(10, 4), 10); // queue ran dry: start now
  assert.equal(nextStartTime(10, 0), 10);
});
