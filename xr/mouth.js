// Turn a short frame of audio into a mouth shape (PLAN.md Part 3, "Showing it").
// Loudness opens the jaw; brightness (zero-crossing rate, a cheap stand-in for
// high vs low frequencies) separates wide sounds ("ee") from round ones ("oo").

const FLOOR_DB = -45; // at or below this the mouth is closed
const CEIL_DB = -6; // at or above this the jaw is fully open
const DARK_HZ = 300; // crossing rate treated as fully round
const BRIGHT_HZ = 2500; // crossing rate treated as fully wide

const clamp01 = (x) => Math.min(1, Math.max(0, x));

export function analyzeFrame(samples, sampleRate) {
  let sum = 0;
  let crossings = 0;
  for (let i = 0; i < samples.length; i++) {
    sum += samples[i] * samples[i];
    if (i > 0 && (samples[i - 1] < 0) !== (samples[i] < 0)) crossings++;
  }
  const rms = samples.length ? Math.sqrt(sum / samples.length) : 0;
  const db = rms > 0 ? 20 * Math.log10(rms) : -Infinity;
  const level = clamp01((db - FLOOR_DB) / (CEIL_DB - FLOOR_DB));
  // Two crossings per cycle, so crossings/2 per frame duration is the frequency.
  const hz = samples.length ? (crossings / 2) * (sampleRate / samples.length) : 0;
  const brightness = clamp01((hz - DARK_HZ) / (BRIGHT_HZ - DARK_HZ));
  return { level, brightness };
}

export function mouthShape({ level, brightness }) {
  return { jaw: level, wide: level * brightness, round: level * (1 - brightness) };
}

// Exponential smoothing with separate time constants (seconds) for opening and closing.
export function createSmoother({ attack = 0.03, release = 0.12 } = {}) {
  let value = 0;
  return {
    step(target, dt) {
      const tau = target > value ? attack : release;
      value += (target - value) * (1 - Math.exp(-dt / tau));
      return value;
    },
    reset(v = 0) {
      value = v;
    },
  };
}
