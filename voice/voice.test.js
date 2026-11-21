import { test } from "node:test";
import assert from "node:assert/strict";
import { applyAging, pitchAndPace, tone, wobble } from "./filter.js";
import { agingParams } from "./aging.js";
import { floatToWav, pcm16ToFloat } from "./wav.js";

const SR = 24000;

// A voice-like test signal: a 150 Hz fundamental with a few harmonics.
function voiceLike(seconds, f0 = 150) {
  const x = new Float32Array(Math.round(seconds * SR));
  for (let n = 0; n < x.length; n++) {
    const t = n / SR;
    let v = 0;
    for (let h = 1; h <= 5; h++) v += Math.sin(2 * Math.PI * f0 * h * t) / h;
    x[n] = 0.3 * v;
  }
  return x;
}

// Estimate the fundamental frequency from the middle of the signal (autocorrelation).
function estimateF0(x) {
  const mid = Math.floor(x.length / 2);
  const len = 6000;
  const seg = x.subarray(mid, mid + len + SR / 60);
  const scores = [];
  for (let lag = Math.floor(SR / 400); lag <= Math.floor(SR / 60); lag++) {
    let dot = 0;
    let e1 = 1e-9;
    let e2 = 1e-9;
    for (let i = 0; i < len; i++) {
      dot += seg[i] * seg[i + lag];
      e1 += seg[i] * seg[i];
      e2 += seg[i + lag] * seg[i + lag];
    }
    scores.push({ lag, s: dot / Math.sqrt(e1 * e2) });
  }
  const max = Math.max(...scores.map((o) => o.s));
  const first = scores.find((o) => o.s >= 0.995 * max);
  return SR / first.lag;
}

const rms = (x) => Math.sqrt(x.reduce((a, v) => a + v * v, 0) / x.length);

test("test signal's pitch is measured correctly", () => {
  const f0 = estimateF0(voiceLike(2));
  assert.ok(Math.abs(f0 - 150) < 3, `got ${f0}`);
});

test("pitch up 3 semitones raises pitch ~19% and keeps the length", () => {
  const x = voiceLike(3);
  const y = pitchAndPace(x, SR, { pitchSemitones: 3, speed: 1 });
  const ratio = estimateF0(y) / estimateF0(x);
  assert.ok(Math.abs(ratio - 1.1892) < 0.03, `pitch ratio ${ratio}`);
  assert.ok(Math.abs(y.length / x.length - 1) < 0.02, `length ratio ${y.length / x.length}`);
});

test("slower pace stretches the length and leaves the pitch alone", () => {
  const x = voiceLike(3);
  const y = pitchAndPace(x, SR, { pitchSemitones: 0, speed: 0.9 });
  assert.ok(Math.abs(y.length / x.length - 1 / 0.9) < 0.02, `length ratio ${y.length / x.length}`);
  const ratio = estimateF0(y) / estimateF0(x);
  assert.ok(Math.abs(ratio - 1) < 0.03, `pitch ratio ${ratio}`);
});

test("tone cut lowers high frequencies and leaves low ones alone", () => {
  const sine = (hz) => {
    const x = new Float32Array(SR);
    for (let n = 0; n < x.length; n++) x[n] = 0.3 * Math.sin((2 * Math.PI * hz * n) / SR);
    return x;
  };
  const high = sine(8000);
  const low = sine(200);
  assert.ok(rms(tone(high, SR, { cut: 1 })) < 0.5 * rms(high), "8 kHz should drop a lot");
  assert.ok(rms(tone(low, SR, { cut: 1 })) > 0.97 * rms(low), "200 Hz should barely change");
  assert.ok(rms(tone(high, SR, { cut: 0.3 })) > rms(tone(high, SR, { cut: 1 })), "more cut, more drop");
});

test("no aging changes nothing", () => {
  const x = voiceLike(1);
  const y = applyAging(x, SR, agingParams(0));
  assert.equal(y.length, x.length);
  for (let i = 0; i < x.length; i += 997) assert.ok(Math.abs(y[i] - x[i]) < 1e-6);
});

test("wobble keeps silence silent", () => {
  const silence = new Float32Array(SR);
  assert.equal(rms(wobble(silence, SR, { vibrato: 0.02, tremor: 0.1 })), 0);
});

test("full aging stays inside the audio range and has a similar length scale", () => {
  const x = voiceLike(2);
  for (const sex of ["female", "male", "neutral"]) {
    const y = applyAging(x, SR, agingParams(1, sex));
    let peak = 0;
    for (const v of y) peak = Math.max(peak, Math.abs(v));
    assert.ok(peak <= 0.981, `${sex} peak ${peak}`);
    assert.ok(y.length > x.length, `${sex} should be slower, so longer`);
  }
});

test("wav round trip keeps the samples", () => {
  const x = voiceLike(0.1);
  const wav = floatToWav(x, SR);
  assert.equal(wav.toString("ascii", 0, 4), "RIFF");
  const back = pcm16ToFloat(wav.subarray(44));
  assert.equal(back.length, x.length);
  assert.ok(Math.abs(back[100] - x[100]) < 1e-3);
});
