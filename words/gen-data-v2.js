#!/usr/bin/env node
/**
 * Generate v2 training data: exact same format as inference (voice/chat.js).
 * Each example is a chat-completion round with the real system prompt,
 * and the assistant reply is {"sentences": ["...", "..."]}.
 *
 * Usage: GEMINI_API_KEY=... node words/gen-data-v2.js [--count 2000] [--batch 5]
 */

import { simulate } from "../sim/engine.js";
import { checkSentence, placeholderKeys } from "../voice/chat.js";
import { readFileSync, writeFileSync, existsSync } from "fs";

try {
  const env = readFileSync(".env", "utf8");
  for (const line of env.split("\n")) {
    const m = line.trim().match(/^([A-Z_]+)=(.+)$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim();
  }
} catch {}

const API_KEY = process.env.GEMINI_API_KEY;
if (!API_KEY) { console.error("Need GEMINI_API_KEY"); process.exit(1); }

const args = process.argv.slice(2);
const flagVal = (name, def) => { const i = args.indexOf(name); return i >= 0 ? parseInt(args[i + 1], 10) : def; };
const N = flagVal("--count", 3000);
const BATCH = flagVal("--batch", 5);
const OUT = "words/training-data-v3.jsonl";

const NAMES = ["Ethan", "Sarah", "Marcus", "Priya", "James", "Olivia", "Wei", "Aisha", "Carlos", "Emma",
  "Noah", "Fatima", "Liam", "Yuki", "Ava", "Omar", "Chloe", "Raj", "Mia", "Jamal",
  "Sophie", "Kai", "Zara", "Leo", "Maya", "Ben", "Nina", "Isaac", "Lily", "Sam"];

const QUESTIONS = [
  "Did I end up okay with money?",
  "How much did I save by the time I was seventy?",
  "Was I healthy?",
  "Did I retire comfortably?",
  "What's the one thing I should change?",
  "How long did I live?",
  "Did my savings last?",
  "Was I able to travel?",
  "Did I have enough for retirement?",
  "What would you tell me about my health?",
  "Should I save more?",
  "How are my healthy years looking?",
  "Did exercise make a difference?",
  "What about my income in retirement?",
  "Any regrets about money?",
  "Was quitting smoking worth it?",
  "Did I ever run out of money?",
  "How did my habits affect me?",
  "What's the best financial decision I made?",
  "Tell me about my future.",
  "Am I going to be okay?",
  "What does retirement look like?",
  "How's my health holding up?",
  "Did I make the right choices?",
  "What would you change if you could go back?",
  "Am I saving enough right now?",
  "What about my sleep habits?",
  "Should I exercise more?",
  "How much money will I need?",
  "Will I be happy?",
];

function randInt(lo, hi) { return lo + Math.floor(Math.random() * (hi - lo + 1)); }
function pick(arr) { return arr[Math.floor(Math.random() * arr.length)]; }

function randomProfile() {
  return {
    name: pick(NAMES), age: randInt(18, 35),
    sex: Math.random() < 0.5 ? "male" : "female", province: "ON",
    income_per_year: randInt(20000, 120000),
    savings: { tfsa: randInt(0, 20000), rrsp: randInt(0, 15000), other: randInt(0, 5000) },
    saving_per_month: randInt(0, 500), retirement_age: randInt(60, 70),
    habits: { exercise_per_week: randInt(0, 7), sleep_hours: randInt(4, 9),
              smoker: Math.random() < 0.2, drinks_per_week: randInt(0, 15) },
  };
}

function buildSystemPrompt(name, keys) {
  return `You are ${name} at age 70, talking warmly to your younger self, who is sitting across from you in a mirror. You are the same person, just older. Speak in first person, naturally, in 1 to 3 short sentences, as in a relaxed conversation.

Rules, no exceptions:
- Answer what they actually asked. Feelings, memories, wisdom and small colour ("I still walk every morning") are welcome.
- NEVER write any digit and NEVER write a number as a word (no "two", "twenty", "hundred", no years, no ages, no amounts). "one" is fine in phrases like "one thing".
- Any fact about money, savings, income, health, life expectancy or age MUST be one of these placeholders, written exactly with braces: ${keys.map(k => `{${k}}`).join(", ")}. Never write a placeholder not on that list. Use a placeholder only when it fits the question.
- If asked about family, jobs, houses, or other facts you have no placeholder for, answer in feelings and values without claiming specifics.
- Never say when or how they will die. Be warm, never scary or guilt-tripping. Talk about options and choices, not fear.
- Reply as JSON only: {"sentences": ["...", "..."]}`;
}

const NUMBER_WORDS = /\b(two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen|twenty|thirty|forty|fifty|sixty|eighty|ninety|hundred|thousand|million|billion|dozen|dozens|couple)\b/i;

async function generateOne(i) {
  const profile = randomProfile();
  const facts = simulate(profile);
  const keys = placeholderKeys(facts);
  const question = pick(QUESTIONS);
  const systemPromptText = buildSystemPrompt(profile.name, keys);

  // Use Gemini's structured output to get JSON sentences directly
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash-lite:generateContent`,
    {
      method: "POST",
      signal: AbortSignal.timeout(15000),
      headers: { "x-goog-api-key": API_KEY, "content-type": "application/json" },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: systemPromptText }] },
        contents: [{ role: "user", parts: [{ text: question }] }],
        generationConfig: {
          responseMimeType: "application/json",
          responseSchema: {
            type: "OBJECT",
            properties: { sentences: { type: "ARRAY", items: { type: "STRING" } } },
            required: ["sentences"],
          },
          temperature: 0.9,
          maxOutputTokens: 200,
        },
      }),
    }
  );

  if (res.status === 429) {
    await sleep(5000 + Math.random() * 5000);
    throw new Error(`Gemini 429 (will retry)`);
  }
  if (!res.ok) throw new Error(`Gemini ${res.status}`);
  const body = await res.json();
  const text = body?.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) return null;

  // Parse out the sentences and check each one
  let sentences;
  try {
    const parsed = JSON.parse(text);
    if (!Array.isArray(parsed.sentences)) return null;
    sentences = parsed.sentences.map(String);
  } catch { return null; }

  if (sentences.length === 0 || sentences.length > 4) return null;

  // Strict filter: checkSentence + reject patterns the model learned wrong from v1
  const clean = sentences.filter(s => {
    if (!checkSentence(s, facts)) return false;
    // Reject % or "percent" right after a placeholder
    if (/\}%/.test(s) || /\}\s*percent/i.test(s)) return false;
    // Reject nested JSON (model outputting JSON inside a sentence)
    if (/\{"sentences"/.test(s) || /\{\\?"sentences/.test(s)) return false;
    // Reject {one_change.slider} used as speakable text (it's a field name like "saving_per_month")
    if (/\{one_change\.slider\}/.test(s)) return false;
    // Reject sentences that are too long (model rambling)
    if (s.length > 250) return false;
    return true;
  });
  if (clean.length === 0) return null;

  // The reply the model should learn to produce
  const replyJson = JSON.stringify({ sentences: clean });

  return {
    profile: { name: profile.name, age: profile.age, sex: profile.sex },
    question,
    reply: replyJson,
    valid: true,
    reason: null,
    system_prompt: systemPromptText,
    user_message: question,
  };
}

async function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function main() {
  console.log(`Generating ${N} valid v2 training examples (will make as many calls as needed)...`);
  const results = [];
  let valid = 0, invalid = 0, callNum = 0;

  while (valid < N) {
    const batch = Math.min(BATCH, N - valid + 5); // slight overshoot is fine
    const promises = Array.from({ length: batch }, (_, j) => generateOne(callNum + j).catch(e => {
      console.error(`  Error ${callNum + j}: ${e.message}`);
      return null;
    }));
    callNum += batch;
    const got = await Promise.all(promises);
    for (const r of got) {
      if (!r) { invalid++; continue; }
      results.push(r);
      valid++;
    }
    process.stdout.write(`  ${valid}/${N} valid, ${invalid} dropped (${callNum} calls)\r`);
    await sleep(500);
  }

  console.log(`\nDone: ${valid} valid, ${invalid} dropped, ${callNum} total calls`);
  writeFileSync(OUT, results.map(r => JSON.stringify(r)).join("\n") + "\n");
  console.log(`Saved to ${OUT}`);
}

main().catch(console.error);
