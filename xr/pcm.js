// Decode CONTRACTS.md audio: base64 16-bit little-endian mono PCM -> Float32 in -1..1.
export function decodePcm16(base64) {
  const bin = atob(base64);
  const n = bin.length >> 1;
  const out = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    let v = bin.charCodeAt(2 * i) | (bin.charCodeAt(2 * i + 1) << 8);
    if (v >= 0x8000) v -= 0x10000;
    out[i] = v / 32768;
  }
  return out;
}
