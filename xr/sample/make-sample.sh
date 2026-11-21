#!/usr/bin/env bash
# Builds xr/sample/greeting.json: a stand-in greeting packed as CONTRACTS.md "reply"
# messages (base64 16-bit LE mono PCM at 24 kHz), one per sentence.
# Uses the Mac's built-in voice, so no real person's voice is in git. macOS only.
set -euo pipefail
cd "$(dirname "$0")"
tmp="$(mktemp -d)"
trap 'rm -rf "$tmp"' EXIT

sentences=(
  "Hey. It's you. Well, it's me, a little older."
  "Come, sit down. I've been looking forward to this."
  "Ask me anything you like."
)

i=0
for s in "${sentences[@]}"; do
  say -o "$tmp/$i.aiff" "$s"
  # 24 kHz, 16-bit little-endian, mono, raw (no header).
  afconvert -f WAVE -d LEI16@24000 -c 1 "$tmp/$i.aiff" "$tmp/$i.wav"
  i=$((i + 1))
done

node - "$tmp" "${sentences[@]}" > greeting.json <<'EOF'
const fs = require("fs");
const [dir, ...sentences] = process.argv.slice(2);
const out = sentences.map((sentence, i) => {
  const wav = fs.readFileSync(`${dir}/${i}.wav`);
  // Find the "data" chunk and keep only the raw PCM after it.
  let p = 12;
  while (wav.toString("ascii", p, p + 4) !== "data") p += 8 + wav.readUInt32LE(p + 4);
  const pcm = wav.subarray(p + 8, p + 8 + wav.readUInt32LE(p + 4));
  return { type: "reply", sentence, audio: pcm.toString("base64"), sampleRate: 24000, done: i === sentences.length - 1 };
});
process.stdout.write(JSON.stringify(out));
EOF
echo "wrote $(pwd)/greeting.json"
