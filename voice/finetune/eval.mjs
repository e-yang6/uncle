// Tests a fine-tuned model through the app's own code path (same prompt, same checker, same filler).
//   MODEL_URL=http://localhost:8001/v1 MODEL_PLAIN=1 node --env-file=.env voice/finetune/eval.mjs [count=200]
// For each of N random people it asks the model and Gemini the same question and reports, per writer:
//   replies clean (every sentence passes checkSentence and fillPlaceholders), sentences passing,
//   replies using a placeholder, time to write. It also prints 12 replies side by side for a human to READ,
//   because passing the checker says nothing about whether the words are any good.
import fs from "node:fs";
import { profileWithFacts } from "../../words/gen-profiles.js";
import { fillPlaceholders } from "../../sim/facts.js";
import { checkSentence, writeReply, writeReplyModel } from "../chat.js";

process.env.MODEL_FIRST = "0"; // Gemini here must not try the model first; the model is called directly below
const N = Number(process.argv[2] ?? 200);
if (!process.env.MODEL_URL) throw new Error("set MODEL_URL (for example an ssh tunnel to the GPU box)");
const pick = (a) => a[Math.floor(Math.random() * a.length)];

// Held-out wording: Ethan's grounding questions plus extra everyday ones. None are copied from the training bank on purpose.
const QUESTIONS = [
  "Did I end up okay with money?", "How much did I save by the time I was seventy?", "Was I healthy?", "Did I retire comfortably?",
  "What's the one thing I should change?", "How long did I live?", "Did my savings last?", "Did I have enough for retirement?",
  "What would you tell me about my health?", "Should I save more?", "How are my healthy years looking?", "Did exercise make a difference?",
  "What about my income in retirement?", "Any regrets about money?", "How did my habits affect me?", "Tell me about my future.",
  "hey, it's me. how are you doing?", "are you happy?", "do you remember being my age?", "i'm kind of scared about all this.",
  "what's the best thing about being seventy?", "did i turn out okay?", "what should i do first?", "thanks for talking to me.",
  "is it worth giving up late nights to sleep more?", "what if i started saving a bit more?", "am i going to be alright?", "do you miss anything about now?",
];
const SPEECH = [
  "", "",
  "So yeah, um, I'm basically just trying to get through my degree, like, I work part time at a pizza place and I'm honestly kind of broke but it's fine, you know? I play basketball when I can.",
  "I would describe myself as organised and fairly cautious. I tend to plan things well in advance, and I prefer to understand a decision fully before I make it. I walk to work most days.",
  "dude honestly life is chill, i game a lot, sleep whenever, my mom keeps telling me to save money lol but whatever, i'll figure it out, vibes mostly.",
];

const grade = (sentences, facts) => {
  const ok = sentences.length > 0 && sentences.every((s) => checkSentence(s, facts) && fillPlaceholders(s, facts).ok);
  return { ok, sentences: sentences.length, pass: sentences.filter((s) => checkSentence(s, facts) && fillPlaceholders(s, facts).ok).length, usesPlaceholder: sentences.some((s) => /\{/.test(s)) };
};

const rows = [];
let next = 0;
async function worker() {
  while (next < N) {
    const i = next++;
    const { profile, facts } = profileWithFacts();
    const question = pick(QUESTIONS);
    const speech = pick(SPEECH);
    const row = { i, name: profile.name, question, speech: Boolean(speech) };
    for (const who of ["model", "gemini"]) {
      const t = performance.now();
      try {
        const s = who === "model"
          ? await writeReplyModel({ question, facts, name: profile.name, speech, timeoutMs: 20000 })
          : await writeReply({ question, facts, name: profile.name, speech, timeoutMs: 20000 });
        row[who] = { text: [...s], ms: Math.round(performance.now() - t), ...grade([...s], facts) };
      } catch (err) {
        row[who] = { error: String(err.message).slice(0, 100) };
      }
    }
    rows.push(row);
  }
}
await Promise.all(Array.from({ length: 4 }, worker));

const med = (a) => (a.length ? [...a].sort((x, y) => x - y)[a.length >> 1] : null);
const p95 = (a) => (a.length ? [...a].sort((x, y) => x - y)[Math.floor(a.length * 0.95)] : null);
for (const who of ["model", "gemini"]) {
  const r = rows.filter((x) => x[who] && !x[who].error);
  const errors = rows.length - r.length;
  const sents = r.reduce((s, x) => s + x[who].sentences, 0);
  const pass = r.reduce((s, x) => s + x[who].pass, 0);
  console.log(`${who.padEnd(7)} replies clean ${r.filter((x) => x[who].ok).length}/${rows.length} (${errors} errors) | sentences passing ${pass}/${sents} (${((100 * pass) / sents).toFixed(1)}%) | replies with a placeholder ${r.filter((x) => x[who].usesPlaceholder).length} | write time median ${med(r.map((x) => x[who].ms))} ms, p95 ${p95(r.map((x) => x[who].ms))} ms`);
}
console.log("\n--- 12 replies side by side (read these) ---");
for (const x of rows.slice(0, 12)) {
  console.log(`\nQ: ${x.question}  [speech sample: ${x.speech}]`);
  console.log("  model : " + (x.model.error ? "ERROR " + x.model.error : x.model.text.join(" ")));
  console.log("  gemini: " + (x.gemini.error ? "ERROR " + x.gemini.error : x.gemini.text.join(" ")));
}
fs.mkdirSync(new URL("./out/", import.meta.url), { recursive: true });
fs.writeFileSync(new URL("./out/eval.json", import.meta.url), JSON.stringify(rows, null, 1));
