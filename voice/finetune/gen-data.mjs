// Training data for the fine-tuned model, in the EXACT format the app uses at runtime.
//   node --env-file=.env voice/finetune/gen-data.mjs [count=30] [out=voice/finetune/out/train.jsonl]
//
// What makes this different from the first sets:
//  - The prompt is voice/chat.js systemPrompt() itself (plain-text variant), so train and runtime match.
//  - Many different questions (voice/finetune/questions.json, made once by Gemini), not 30.
//  - Conversations of 1 to 3 turns, so the model learns to use the recent history.
//  - About two thirds of examples carry a speech sample in a different personal style, so the model learns to
//    borrow vocabulary instead of always sounding like one wise elder.
//  - A teacher reply is kept only if it passes checkSentence() (no digits, number words, %, $, slider name or
//    unknown placeholder) and Ethan's fillPlaceholders(), and is short.
// The teacher is Gemini through the same writeReply() the app uses; we never copy facts from the teacher.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { profileWithFacts } from "../../words/gen-profiles.js";
import { fillPlaceholders } from "../../sim/facts.js";
import { checkSentence, placeholderKeys, systemPrompt } from "../chat.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const API = "https://generativelanguage.googleapis.com/v1beta/models";
const KEY = process.env.GEMINI_API_KEY;
if (!KEY) throw new Error("set GEMINI_API_KEY");
const TEACHER = process.env.TEACHER_MODEL || "gemini-3.5-flash-lite";
const HELPER = process.env.HELPER_MODEL || "gemini-3.5-flash-lite";
const JUDGE = process.env.JUDGE_MODEL || "gemini-3.5-flash";

const pick = (a) => a[Math.floor(Math.random() * a.length)];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function gemini(prompt, { schema, temperature = 1, model = HELPER, tries = 4, raw } = {}) {
  for (let i = 0; i < tries; i++) {
    try {
      const res = await fetch(`${API}/${model}:generateContent`, {
        method: "POST",
        headers: { "x-goog-api-key": KEY, "content-type": "application/json" },
        body: JSON.stringify(raw ?? {
          contents: [{ role: "user", parts: [{ text: prompt }] }],
          generationConfig: { temperature, ...(schema ? { responseMimeType: "application/json", responseSchema: schema } : {}) },
        }),
        signal: AbortSignal.timeout(30000),
      });
      if (res.status === 429 || res.status >= 500) throw new Error("retry " + res.status);
      if (!res.ok) throw new Error("Gemini " + res.status + " " + (await res.text()).slice(0, 150));
      const body = await res.json();
      return body?.candidates?.[0]?.content?.parts?.map((p) => p.text ?? "").join("") ?? "";
    } catch (err) {
      if (i === tries - 1) throw err;
      await sleep(1500 * 2 ** i);
    }
  }
}

// ---- questions: made once, then reused ----
const CATEGORIES = {
  money: "about their savings, retirement, income, whether money will last, a house, debt, whether they are saving enough",
  health: "about their health, energy, habits, how long they might live (people ask it bluntly), sleep, exercise, smoking, drinking",
  what_if: "starting with 'what if' about changing one habit or saving more or less (exercise, sleep, quitting smoking, saving a bit more)",
  feelings: "about regrets, pride, happiness, fear, loneliness, what the older self misses, what the best part of life was",
  advice: "asking for advice or what to do next, what matters most, where to start, one thing to change",
  people_and_life: "about family, partner, kids, friends, career, travel, where they lived (facts the older self has no data on)",
  meta: "about the older self itself: are you really me, is this real, how do you know, what is it like to be old, can you see the future",
  scared_or_blunt: "anxious or blunt: will I be poor, will I die early, did I screw up, is it too late, I am overwhelmed",
  small_talk: "casual: hello, thanks, a joke, tell me a story, how are you, what did you have for breakfast",
  answerable_money: "that the future self can answer with numbers from a simulation: how much they had saved by seventy, what their retirement income per year is like, whether the money lasts until ninety, whether they are okay or comfortable financially",
  answerable_health: "that the future self can answer with a simulation range: how long people with their habits tend to live (asked gently or bluntly), how many healthy years, how old they look or feel in the mirror, how their habits affect their health",
  answerable_change: "asking what single change would help most, whether saving more or exercising more or sleeping more or quitting smoking pays off, what they should do first",
  off_topic: "unrelated things (weather, sports, politics, coding help) that a warm older self would gently steer back from",
};
async function loadQuestions() {
  const file = path.join(here, "questions.json");
  const all = fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, "utf8")) : {};
  for (const [cat, desc] of Object.entries(CATEGORIES)) {
    if (all[cat]) continue; // already made: reuse
    const out = new Set();
    for (let round = 0; round < 3; round++) {
      const text = await gemini(
        `Write 40 different short things a young Canadian (18 to 30) might say out loud to their future self at age 70 in a mirror, ${desc}. Casual spoken wording, a mix of one-liners and longer, some with slang or typos from speech-to-text. No numbers written as digits. Return JSON: {"questions": ["..."]}`,
        { schema: { type: "OBJECT", properties: { questions: { type: "ARRAY", items: { type: "STRING" } } }, required: ["questions"] } },
      );
      for (const q of JSON.parse(text).questions ?? []) if (q.length > 3 && q.length < 200) out.add(q.trim());
    }
    all[cat] = [...out];
    console.log(`questions ${cat}: ${all[cat].length}`);
    fs.writeFileSync(file, JSON.stringify(all, null, 1));
  }
  return all;
}

// ---- speech samples in different personal styles ----
const STYLES = [
  "very casual, lots of 'like' and 'you know', trails off", "polite and a bit formal, full sentences", "jokey and sarcastic, short punchy lines",
  "quiet and hesitant, lots of 'um' and pauses", "enthusiastic, talks fast, exclamations", "dry and matter-of-fact, minimal words",
  "warm and chatty, tells small stories", "slangy Gen Z phrasing, abbreviations spoken out", "thoughtful, careful word choice, a little poetic",
  "blunt and practical, no fluff",
];
async function speechSample(profile) {
  const style = pick(STYLES);
  const t = await gemini(
    `Write the transcript of a 120 to 170 word spoken interview answer by ${profile.name}, a ${profile.age}-year-old Canadian, about their day, money and habits. Style: ${style}. Plain transcript only, first person, no stage directions. Do not write any digits (spell numbers out).`,
    { temperature: 1 },
  );
  return t.trim().slice(0, 1200);
}

// ---- one validated reply ----
// Extra rule only the teacher sees (it is NOT in the saved training prompt): stops the teacher agreeing with
// questions that assume facts, which the judge below would otherwise have to throw away.
const HINT_BASE = "\n\nEXTRA RULES FOR THIS REPLY: Do not start with the word Oh. Vary your openings and sentence shapes. Never use the phrase \x27rather talk about\x27. At most one tiny everyday habit, and usually none.";
// Questions that assume facts nobody gave us: stay with feelings and values, in fresh words each time.
const HINT_NO_FACTS = " Never confirm, deny or invent any concrete fact about the person\x27s life, relationships, body, health condition or past, even if the question assumes it or jokes about it. Respond to the feeling behind the question, in fresh words, without refusing or sounding evasive.";
// Questions about money, health or change should use the facts sheet.
const HINT_USE_FACTS = " This question is about money, health or what could change, so use at least one placeholder that fits it (for example the savings, retirement income, healthy years, or the one change label).";
const NO_FACT_CATS = new Set(["people_and_life", "meta", "off_topic", "small_talk", "scared_or_blunt"]);
const FACT_CATS = new Set(["money", "health", "what_if", "advice", "answerable_money", "answerable_health", "answerable_change"]);
const hintFor = (cat) => HINT_BASE + (NO_FACT_CATS.has(cat) ? HINT_NO_FACTS : "") + (FACT_CATS.has(cat) ? HINT_USE_FACTS : "");
async function teacherCall({ question, history, facts, name, speech, cat }) {
  const keys = placeholderKeys(facts);
  const contents = [...history.map((h) => ({ role: h.role === "you" ? "user" : "model", parts: [{ text: h.text }] })), { role: "user", parts: [{ text: question }] }];
  const t = await gemini(null, {
    raw: {
      systemInstruction: { parts: [{ text: systemPrompt(name, keys, speech) + hintFor(cat) }] },
      contents,
      generationConfig: { responseMimeType: "application/json", responseSchema: { type: "OBJECT", properties: { sentences: { type: "ARRAY", items: { type: "STRING" } } }, required: ["sentences"] }, temperature: 1, maxOutputTokens: 300 },
    },
    model: TEACHER,
  });
  return (JSON.parse(t).sentences ?? []).map(String).slice(0, 4);
}

const bad = { empty: 0, check: 0, fill: 0, long: 0, other: 0, inventedFact: 0, repeatOpening: 0 };
async function teacherReply(args) {
  for (let attempt = 0; attempt < 3; attempt++) {
    let s;
    try {
      s = await teacherCall(args);
    } catch {
      bad.other++;
      continue;
    }
    const { facts } = args;
    if (!s.length) { bad.empty++; continue; }
    if (s.some((x) => x.length > 220) || s.length > 3) { bad.long++; continue; }
    if (!s.every((x) => checkSentence(x, facts))) { bad.check++; continue; }
    if (!s.every((x) => fillPlaceholders(x, facts).ok)) { bad.fill++; continue; }
    if (s.some((x) => /\b(many|several|few|some|those|these)\s+\{/i.test(x))) { bad.check++; continue; }
    return s;
  }
  return null;
}

// A second Gemini call flags replies that state concrete facts about the person's life that nobody gave us
// (a named friend's career, a loan paid off, a medical condition, a purchase). Feelings, values and small habits are fine.
async function inventsFacts(question, reply) {
  try {
    const t = await gemini(
      `A person talks to their future self at 70. The future self may ONLY express feelings, values, mood, gentle advice, and one tiny harmless everyday habit at most (like a morning walk or a coffee). It must NOT assert, confirm or deny ANY concrete fact about the person\x27s life: relationships or marriage, kids, named people, jobs, skills, houses, cars, debts, purchases, places lived, hobbies achieved, medical conditions, aches or pains, or physical state. Anything written inside {curly braces} is a data placeholder filled in later from a simulation: IGNORE it, it is allowed and is not a claim. That includes agreeing with a question that assumes such a fact, and playful or joking confirmations.\nQuestion: ${question}\nReply: ${reply}\nDoes the reply assert, confirm or deny any such concrete fact? JSON: {\"states_fact\": true or false}`,
      { temperature: 0, model: JUDGE, schema: { type: "OBJECT", properties: { states_fact: { type: "BOOLEAN" } }, required: ["states_fact"] } },
    );
    return JSON.parse(t).states_fact === true;
  } catch {
    return true; // when unsure, drop it
  }
}
// No single opening may dominate: the model would learn one catchphrase.
const opens = new Map();
let total = 0;
const opening = (text) => text.toLowerCase().replace(/[^a-z ]/g, "").split(" ").slice(0, 2).join(" ");
const openingOk = (text) => { const k = opening(text); return total < 20 || (opens.get(k) ?? 0) / total < 0.04; };
const noteOpening = (text) => { const k = opening(text); opens.set(k, (opens.get(k) ?? 0) + 1); total++; };

async function conversation(qs) {
  const { profile, facts } = profileWithFacts();
  const speech = Math.random() < 0.65 ? await speechSample(profile).catch(() => "") : "";
  const keys = placeholderKeys(facts);
  const system = systemPrompt(profile.name, keys, speech, { json: false });
  const turns = Math.random() < 0.5 ? 1 : Math.random() < 0.6 ? 2 : 3;
  const history = [];
  const messages = [{ role: "system", content: system }];
  const examples = [];
  for (let t = 0; t < turns; t++) {
    const only = process.env.CATS ? process.env.CATS.split(",") : Object.keys(qs);
    const cat = pick(only);
    const question = pick(qs[cat]);
    const s = await teacherReply({ question, history, facts, name: profile.name, speech, cat });
    if (!s) break;
    const text = s.join(" ");
    if (!openingOk(text)) { bad.repeatOpening++; break; }
    if (await inventsFacts(question, text)) { bad.inventedFact++; break; }
    noteOpening(text);
    messages.push({ role: "user", content: question }, { role: "assistant", content: text });
    examples.push({ messages: structuredClone(messages), meta: { category: cat, turn: t + 1, speech: Boolean(speech) } });
    history.push({ role: "you", text: question }, { role: "future", text });
  }
  return examples;
}

const count = Number(process.argv[2] ?? 30);
const outFile = process.argv[3] ?? path.join(here, "out", "train.jsonl");
fs.mkdirSync(path.dirname(outFile), { recursive: true });
const qs = await loadQuestions();
const out = fs.createWriteStream(outFile, { flags: "a" });
let made = 0, convs = 0, next = 0;
const CONC = Number(process.env.CONCURRENCY || 4);
await Promise.all(Array.from({ length: CONC }, async () => {
  while (made < count) {
    if (next++ > count * 6) return;
    try {
      const ex = await conversation(qs);
      convs++;
      for (const e of ex) { out.write(JSON.stringify(e) + "\n"); made++; }
      if (convs % 5 === 0) console.log(`${made} examples from ${convs} conversations`);
    } catch (err) {
      bad.other++;
    }
  }
}));
out.end();
console.log(`done: ${made} examples, ${convs} conversations -> ${outFile}`);
console.log("rejected teacher drafts:", JSON.stringify(bad));
