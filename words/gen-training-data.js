import { profileWithFacts } from "./gen-profiles.js";
import { fillPlaceholders } from "../sim/facts.js";
import { writeFileSync, readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const here = path.dirname(fileURLToPath(import.meta.url));
const OUT_PATH = path.join(here, "training-data.jsonl");

const GEMINI_KEY = process.env.GEMINI_API_KEY;
if (!GEMINI_KEY) {
  console.error("Set GEMINI_API_KEY in .env or environment");
  process.exit(1);
}

const QUESTIONS = [
  "Did we ever buy a house?",
  "Was I okay with money?",
  "How much did I save by the time I was seventy?",
  "Did I retire early?",
  "What's my retirement income like?",
  "Will my money last?",
  "How's my health?",
  "How long do I live?",
  "Am I healthy in my old age?",
  "What's the one thing I should change?",
  "Should I save more?",
  "What if I exercised more?",
  "Do I regret not saving earlier?",
  "What about my sleep habits?",
  "Is smoking really that bad for me?",
  "How much should I be putting away each month?",
  "What does my retirement look like?",
  "Am I going to be comfortable?",
  "What would you tell younger me?",
  "Did the saving pay off?",
  "How are my healthy years?",
  "What's the chance my money lasts to ninety?",
  "Should I cut back on drinking?",
  "What if I quit smoking?",
  "Tell me about my finances at seventy.",
  "What's the best thing I can do right now?",
  "How do my habits affect my health?",
  "What does the typical outcome look like for someone like me?",
  "Am I saving enough?",
  "What would happen if I saved fifty more a month?",
];

const SYSTEM_PROMPT = `You are the user's future self at age 70. You speak in first person, warmly and honestly. You talk about agency and options, not fear.

CRITICAL RULES:
1. Never write any number. Instead use placeholders from the facts sheet like {savings_70.median} or {life_expectancy.median}.
2. Valid placeholders: {savings_70.low}, {savings_70.median}, {savings_70.high}, {income_retired_per_year.low}, {income_retired_per_year.median}, {income_retired_per_year.high}, {money_lasts_to_90_chance}, {life_expectancy.low}, {life_expectancy.median}, {life_expectancy.high}, {healthy_years.low}, {healthy_years.median}, {healthy_years.high}, {apparent_age_at_70}, {one_change.slider}, {one_change.label}.
3. Keep replies to 2-3 sentences. Warm, not scary. Never state a death age directly; use ranges like "people with my habits tend to live to between {life_expectancy.low} and {life_expectancy.high}."
4. You may invent feelings or color ("I still go walking every morning") but anything about money, health, or age MUST use a placeholder.
5. Don't use the word "about" before a placeholder; the system adds that.`;

async function callGemini(profile, facts, question) {
  const userMsg = `The user's name is ${profile.name}, age ${profile.age}, ${profile.sex}.

Facts sheet (use these placeholders in your reply):
${JSON.stringify(facts, null, 2)}

The user asks: "${question}"

Reply as their future self at 70. Use placeholders, never raw numbers.`;

  const body = {
    contents: [
      { role: "user", parts: [{ text: userMsg }] },
    ],
    systemInstruction: { parts: [{ text: SYSTEM_PROMPT }] },
    generationConfig: {
      temperature: 0.9,
      maxOutputTokens: 4096,
      thinkingConfig: { thinkingBudget: 0 },
    },
  };

  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.8-flash:generateContent?key=${GEMINI_KEY}`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Gemini ${res.status}: ${text.slice(0, 200)}`);
  }

  const data = await res.json();
  const reply = data.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!reply) throw new Error("No reply from Gemini");
  return reply.trim();
}

function validate(reply, facts) {
  const result = fillPlaceholders(reply, facts);
  if (!result.ok) return { valid: false, reason: result.error, detail: result.keys || result.text };
  return { valid: true, filled: result.text };
}

async function generateOne() {
  const { profile, facts } = profileWithFacts();
  const question = QUESTIONS[Math.floor(Math.random() * QUESTIONS.length)];

  let reply = await callGemini(profile, facts, question);
  let check = validate(reply, facts);

  if (!check.valid) {
    reply = await callGemini(profile, facts, question + " (Remember: use ONLY placeholders from the facts sheet, never raw numbers or number words.)");
    check = validate(reply, facts);
  }

  return {
    profile: { name: profile.name, age: profile.age, sex: profile.sex },
    question,
    reply,
    valid: check.valid,
    reason: check.valid ? null : check.reason,
  };
}

async function main() {
  const target = parseInt(process.argv[2] || "100", 10);
  const batchSize = parseInt(process.argv[3] || "5", 10);
  let generated = 0;
  let valid = 0;
  let failed = 0;

  const existing = existsSync(OUT_PATH)
    ? readFileSync(OUT_PATH, "utf8").trim().split("\n").filter(Boolean).length
    : 0;
  console.log(`Existing examples: ${existing}. Generating ${target} more...`);

  const fd = existsSync(OUT_PATH) ? "a" : "w";
  const stream = await import("node:fs").then(fs =>
    fs.createWriteStream(OUT_PATH, { flags: fd === "a" ? "a" : "w" })
  );

  for (let i = 0; i < target; i += batchSize) {
    const batch = Math.min(batchSize, target - i);
    const promises = Array.from({ length: batch }, () => generateOne().catch(e => {
      console.error(`  Error: ${e.message}`);
      return null;
    }));

    const results = await Promise.all(promises);
    for (const r of results) {
      if (!r) { failed++; continue; }
      generated++;
      if (r.valid) {
        valid++;
        stream.write(JSON.stringify(r) + "\n");
      } else {
        failed++;
      }
    }

    console.log(`  ${generated + failed}/${target} done, ${valid} valid, ${failed} failed`);
    await new Promise(r => setTimeout(r, 200));
  }

  stream.end();
  console.log(`\nDone. ${valid} valid examples written to ${OUT_PATH}`);
  console.log(`${failed} failed (bad placeholders or API errors)`);
}

main();
