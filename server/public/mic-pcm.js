// Pure audio helpers for the microphone (no browser APIs, so they are testable in Node).
// The headset's mic runs at the device rate (often 48000 Hz); the /voice socket wants
// 16-bit mono PCM at 16000 Hz, base64 (CONTRACTS.md "Voice pipeline").

// Float samples at fromRate -> float samples at toRate (averaging when going down, so it doesn't alias).
export function resampleTo(samples, fromRate, toRate = 16000) {
  if (fromRate === toRate) return samples;
  const ratio = fromRate / toRate;
  const n = Math.floor(samples.length / ratio);
  const out = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const start = i * ratio;
    const end = Math.min(samples.length, (i + 1) * ratio);
    let sum = 0;
    let count = 0;
    for (let j = Math.floor(start); j < end; j++) (sum += samples[j]), count++;
    out[i] = count ? sum / count : 0;
  }
  return out;
}

// Float samples -> base64 of 16-bit little-endian PCM.
export function toBase64Pcm16(samples) {
  const bytes = new Uint8Array(samples.length * 2);
  const view = new DataView(bytes.buffer);
  for (let i = 0; i < samples.length; i++) {
    const v = Math.max(-1, Math.min(1, samples[i]));
    view.setInt16(i * 2, Math.round(v * 32767), true);
  }
  let binary = "";
  for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(binary);
}

// Collects tiny blocks from the browser's audio thread and hands back ~100 ms chunks.
export function makeChunker(sourceRate, onChunk, chunkMs = 100) {
  const target = Math.round((sourceRate * chunkMs) / 1000);
  let buf = new Float32Array(0);
  return (block) => {
    const merged = new Float32Array(buf.length + block.length);
    merged.set(buf);
    merged.set(block, buf.length);
    buf = merged;
    while (buf.length >= target) {
      onChunk(buf.slice(0, target));
      buf = buf.slice(target);
    }
  };
}
