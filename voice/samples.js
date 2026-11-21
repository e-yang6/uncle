// Pre-recorded lines, played when the live speech service (ElevenLabs) is down or out of credits,
// so the future self can still talk during an outage (PLAN.md: "ready-made voice, then text").
// Made once by voice/make-samples.mjs with the stock voice; the server ages them like any other audio.
// Only lines with no numbers can be pre-recorded; anything else stays text-only.
import { readFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { pcm16ToFloat } from "./wav.js";

const HERE = dirname(fileURLToPath(import.meta.url));
export const SAMPLES_DIR = join(HERE, "samples");
const GENERIC_GREETING = "Hello, it's me, from a long way down the road.";
const NAMED_GREETING = /^Hello .{1,40}, it's me, from a long way down the road\.$/;

const norm = (t) => String(t).trim().toLowerCase();

export function loadSamples(dir = SAMPLES_DIR) {
  const map = new Map();
  const indexFile = join(dir, "index.json");
  if (!existsSync(indexFile)) return map;
  const { sampleRate, lines } = JSON.parse(readFileSync(indexFile, "utf8"));
  for (const { text, file } of lines) {
    const path = join(dir, file);
    if (!existsSync(path)) continue;
    map.set(norm(text), { text, samples: pcm16ToFloat(readFileSync(path)), sampleRate });
  }
  return map;
}

// The recorded clip for this sentence, or null. A greeting that says the person's name falls back to
// the nameless greeting; the clip's own text is returned so the caption matches what is actually said.
export function clipFor(map, sentence) {
  const exact = map.get(norm(sentence));
  if (exact) return exact;
  if (NAMED_GREETING.test(sentence.trim())) return map.get(norm(GENERIC_GREETING)) ?? null;
  return null;
}
