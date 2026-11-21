// Records the pre-recorded fallback lines with the stock voice. Costs a few hundred characters of
// ElevenLabs credit. Run when the lines change:  node --env-file=.env voice/make-samples.mjs
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { speak } from "./tts.js";
import { floatToPcm16 } from "./wav.js";
import { STATIC_LINES } from "../server/brain.js";
import { SAMPLES_DIR } from "./samples.js";

mkdirSync(SAMPLES_DIR, { recursive: true });
const lines = [];
let sampleRate = 24000;
for (const [i, text] of STATIC_LINES.entries()) {
  const tts = await speak(text);
  sampleRate = tts.sampleRate;
  const file = `line${String(i + 1).padStart(2, "0")}.pcm`;
  writeFileSync(join(SAMPLES_DIR, file), floatToPcm16(tts.samples));
  lines.push({ text, file });
  console.log(`${file}  ${(tts.samples.length / sampleRate).toFixed(1)} s  ${text}`);
}
writeFileSync(join(SAMPLES_DIR, "index.json"), JSON.stringify({ voice: "stock (ElevenLabs default)", sampleRate, lines }, null, 2));
console.log(`Saved ${lines.length} lines.`);
