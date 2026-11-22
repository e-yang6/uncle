import { test } from "node:test";
import assert from "node:assert/strict";
import { FILLER_LINES, createFillerBank, _resetFillerCache } from "./fillers.js";
import { checkSentence } from "./chat.js";

const tts = (text) => Promise.resolve({ samples: new Float32Array(10), sampleRate: 24000, text });
const tick = () => new Promise((r) => setTimeout(r, 0));

test("every filler line has no numbers (passes the same checker as replies)", () => {
  for (const line of FILLER_LINES) assert.ok(checkSentence(line, {}), line);
});

test("nothing to play until a line is made; then lines don't repeat until all are used", async () => {
  _resetFillerCache();
  const bank = createFillerBank(tts, { lines: FILLER_LINES.slice(0, 3) });
  assert.equal(bank.take(), null);
  bank.prepare(3);
  await tick();
  const seen = new Set([bank.take().sentence, bank.take().sentence, bank.take().sentence]);
  assert.equal(seen.size, 3);
  assert.ok(bank.take(), "after all are used, lines may come round again");
});

test("stock voice lines are made once and shared across sessions; a failed line is retried later", async () => {
  _resetFillerCache();
  let calls = 0;
  const lines = ["Hmm. Let me see.", "Hold on, let me work that out."];
  const speak = (text) => {
    calls++;
    return text.startsWith("Hmm") && calls <= 2 ? Promise.reject(new Error("down")) : tts(text);
  };
  createFillerBank(speak, { lines }).prepare(2);
  await tick();
  createFillerBank(speak, { lines }).prepare(2);
  await tick();
  assert.equal(calls, 3, "two first tries, then only the failed line again");
});
