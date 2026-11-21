// Uncle's voice aging filter: our own audio code (PLAN.md Part 4).
// Works on mono Float32 samples in [-1, 1]. No dependencies.
//
// Five changes, each with its own amount: pitch, pace, wobble (vibrato + tremor),
// breathiness, tone. See aging.js for how the amounts are chosen.

// Small seeded random numbers so the same input always gives the same output.
function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Play the samples back faster (ratio > 1: higher pitch, shorter) or slower.
export function resample(x, ratio) {
  if (x.length < 2 || Math.abs(ratio - 1) < 1e-6) return x;
  const n = Math.floor((x.length - 1) / ratio);
  const out = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const p = i * ratio;
    const i0 = Math.floor(p);
    const f = p - i0;
    out[i] = x[i0] * (1 - f) + x[i0 + 1] * f;
  }
  return out;
}

// Make the audio s times longer without changing its pitch (WSOLA).
export function timeStretch(x, s, sr = 24000) {
  if (Math.abs(s - 1) < 1e-4 || x.length < 4096) return x;
  const N = 1024; // frame length
  const H = N / 2; // output hop (50% overlap, Hann window sums to 1)
  const anaHop = H / s;
  const tol = Math.round(0.006 * sr); // search +/- 6 ms for the best join
  const win = new Float32Array(N);
  for (let i = 0; i < N; i++) win[i] = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / N);

  const outLen = Math.round(x.length * s);
  const out = new Float32Array(outLen + N);
  const maxStart = x.length - N;
  let prev = 0;
  for (let k = 0; ; k++) {
    const outPos = k * H;
    if (outPos >= outLen) break;
    const nominal = Math.round(k * anaHop);
    let p;
    if (k === 0) {
      p = 0;
    } else {
      // The frame that would naturally follow the previous one.
      const ref = Math.min(prev + H, maxStart);
      const lo = Math.max(0, nominal - tol);
      const hi = Math.min(maxStart, nominal + tol);
      if (lo > hi) break;
      let best = -Infinity;
      p = lo;
      for (let c = lo; c <= hi; c++) {
        let dot = 0;
        let e = 1e-9;
        for (let i = 0; i < N; i += 2) {
          const v = x[c + i];
          dot += v * x[ref + i];
          e += v * v;
        }
        const score = dot / Math.sqrt(e);
        if (score > best) {
          best = score;
          p = c;
        }
      }
    }
    for (let i = 0; i < N; i++) out[outPos + i] += x[p + i] * win[i];
    prev = p;
  }
  return out.subarray(0, outLen);
}

// Pitch shift in semitones, then slow down (speed < 1) or speed up, keeping both independent.
export function pitchAndPace(x, sr, { pitchSemitones = 0, speed = 1 } = {}) {
  const ratio = Math.pow(2, pitchSemitones / 12);
  const shifted = resample(x, ratio); // pitch * ratio, duration / ratio
  // Want final duration = original / speed, so stretch by ratio / speed.
  return timeStretch(shifted, ratio / speed, sr);
}

// Wobble: slow pitch drift (vibrato) and loudness drift (tremor).
// vibrato = rough peak pitch deviation as a fraction (0.01 = 1%). tremor = loudness swing fraction.
export function wobble(x, sr, { vibrato = 0, tremor = 0, seed = 7 } = {}) {
  if (!vibrato && !tremor) return x;
  const rand = rng(seed);
  const f1 = 4.8;
  const f2 = 6.9;
  const ph1 = rand() * 2 * Math.PI;
  const ph2 = rand() * 2 * Math.PI;
  const ph3 = rand() * 2 * Math.PI;
  const D = (vibrato * sr) / (2 * Math.PI * 5.5); // delay swing in samples
  const base = Math.ceil(D) + 2;
  const out = new Float32Array(x.length);
  for (let n = 0; n < x.length; n++) {
    const t = n / sr;
    const m = 0.6 * Math.sin(2 * Math.PI * f1 * t + ph1) + 0.4 * Math.sin(2 * Math.PI * f2 * t + ph2);
    const pos = n - (base + D * m);
    let v = 0;
    if (pos >= 0) {
      const i0 = Math.floor(pos);
      const f = pos - i0;
      v = x[i0] * (1 - f) + (x[i0 + 1] ?? 0) * f;
    }
    const g = 1 + tremor * Math.sin(2 * Math.PI * 5.2 * t + ph3);
    out[n] = v * g;
  }
  return out;
}

// Tone: turn the brightness down a little. cut 0 = unchanged, 1 = everything above ~3 kHz gone.
export function tone(x, sr, { cut = 0, cutoffHz = 3000 } = {}) {
  if (!cut) return x;
  const alpha = 1 - Math.exp((-2 * Math.PI * cutoffHz) / sr);
  const out = new Float32Array(x.length);
  let lp = 0;
  for (let n = 0; n < x.length; n++) {
    lp += alpha * (x[n] - lp);
    out[n] = x[n] - cut * (x[n] - lp);
  }
  return out;
}

// Breathiness: shaped noise that follows the voice's loudness, so it never hisses in silence.
export function breath(x, sr, { mix = 0, seed = 11 } = {}) {
  if (!mix) return x;
  const rand = rng(seed);
  const aHp = 1 - Math.exp((-2 * Math.PI * 1500) / sr);
  const aEnv = 1 - Math.exp(-1 / (0.02 * sr));
  const out = new Float32Array(x.length);
  let lp = 0;
  let env = 0;
  for (let n = 0; n < x.length; n++) {
    const noise = rand() * 2 - 1;
    lp += aHp * (noise - lp);
    const hp = noise - lp; // noise with the lows removed
    env += aEnv * (Math.abs(x[n]) - env);
    out[n] = x[n] + mix * hp * env * 2;
  }
  return out;
}

function limit(x) {
  let peak = 0;
  for (let i = 0; i < x.length; i++) peak = Math.max(peak, Math.abs(x[i]));
  if (peak <= 0.98) return x;
  const g = 0.98 / peak;
  const out = new Float32Array(x.length);
  for (let i = 0; i < x.length; i++) out[i] = x[i] * g;
  return out;
}

// params: { pitchSemitones, speed, vibrato, tremor, breath, toneCut }
export function applyAging(x, sr, params = {}) {
  let y = pitchAndPace(x, sr, { pitchSemitones: params.pitchSemitones, speed: params.speed });
  y = wobble(y, sr, { vibrato: params.vibrato, tremor: params.tremor });
  y = tone(y, sr, { cut: params.toneCut });
  y = breath(y, sr, { mix: params.breath });
  return limit(y);
}
