#!/usr/bin/env node
/**
 * 200-conversation grounding test: fine-tuned model vs Gemini.
 * Measures per PLAN.md Part 2: replies with zero invented numbers,
 * rewrite rate, latency. Results go to DEVPOST.md.
 *
 * Usage: node words/grounding-test.js [--count 200] [--batch 5]
 * Needs: MODEL_URL and/or GEMINI_API_KEY in env or .env
 */

import { simulate } from "../sim/engine.js";
import { fillPlaceholders } from "../sim/facts.js";
import { checkSentence, placeholderKeys, writeReply } from "../voice/chat.js";
import { readFileSync, writeFileSync } from "fs";

try {
  const env = readFileSync(".env", "utf8");
  for (const line of env.split("\n")) {
    const m = line.trim().match(/^([A-Z_]+)=(.+)$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim();
  }
} catch {}

const MODEL_URL = process.env.MODEL_URL;
const GEMINI_KEY = process.env.GEMINI_API_KEY;

const args = process.argv.slice(2);
const flagVal = (name, def) => { const i = args.indexOf(name); return i >= 0 ? parseInt(args[i + 1], 10) : def; };
const N = flagVal("--count", 200);
const BATCH = flagVal("--batch", 5);

const NAMES = ["Ethan", "Sarah", "Marcus", "Priya", "James", "Olivia", "Wei", "Aisha", "Carlos", "Emma",
  "Noah", "Fatima", "Liam", "Yuki", "Ava", "Omar", "Chloe", "Raj", "Mia", "Jamal"];
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

function flattenFacts(facts) {
  const out = {};
  const walk = (obj, prefix) => {
    for (const [k, v] of Object.entries(obj ?? {})) {
      if (k === "sources") continue;
      const path = prefix ? `${prefix}.${k}` : k;
      if (v && typeof v === "object" && !Array.isArray(v)) walk(v, path);
      else if (typeof v === "number" || typeof v === "string") out[path] = v;
    }
  };
  walk(facts, "");
  return out;
}

function gradeReply(sentences, facts) {
  let good = 0, bad = 0, rewrite = 0;
  for (const s of sentences) {
    if (checkSentence(s, facts)) {
      const filled = fillPlaceholders(s, facts);
      if (filled.ok) good++;
      else bad++;
    } else {
      bad++;
      rewrite++;
    }
  }
  const replyClean = bad === 0 && sentences.length > 0;
  return { good, bad, rewrite, total: sentences.length, replyClean };
}

async function callFineTuned(question, facts, name) {
  if (!MODEL_URL) return null;
  const keys = Object.keys(flattenFacts(facts));
  const start = Date.now();
  const res = await fetch(`${MODEL_URL}/chat/completions`, {
    method: "POST",
    signal: AbortSignal.timeout(10000),
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      messages: [
        { role: "system", content: `You are ${name} at age 70. Reply warmly in 1-3 sentences. Never write any digit or number word. Use only these placeholders: ${keys.map(k => `{${k}}`).join(", ")}. Reply as JSON: {"sentences": ["...", "..."]}` },
        { role: "user", content: question },
      ],
      temperature: 0.7, max_tokens: 300,
    }),
  });
  const latency = Date.now() - start;
  const body = await res.json();
  const text = body?.choices?.[0]?.message?.content ?? "";
  let sentences;
  try { sentences = JSON.parse(text).sentences; } catch {}
  if (!Array.isArray(sentences)) sentences = text.split(/(?<=[.!?])\s+/).filter(Boolean).slice(0, 4);
  return { sentences: sentences.map(String), latency };
}

async function callGemini(question, facts, name) {
  if (!GEMINI_KEY) return null;
  // Temporarily unset MODEL_URL so writeReply uses Gemini directly
  const saved = process.env.MODEL_URL;
  delete process.env.MODEL_URL;
  const start = Date.now();
  try {
    const sentences = await writeReply({
      question, facts, name,
      apiKey: GEMINI_KEY,
      timeoutMs: 10000,
    });
    return { sentences, latency: Date.now() - start };
  } finally {
    if (saved !== undefined) process.env.MODEL_URL = saved;
  }
}

async function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function runOne(i) {
  const profile = randomProfile();
  const facts = simulate(profile);
  const question = pick(QUESTIONS);
  const result = { i, profile: { name: profile.name, age: profile.age, sex: profile.sex }, question };

  if (MODEL_URL) {
    try {
      const r = await callFineTuned(question, facts, profile.name);
      if (r) {
        const g = gradeReply(r.sentences, facts);
        result.finetune = { sentences: r.sentences, ...g, latency: r.latency };
      }
    } catch (e) { result.finetune = { error: e.message }; }
  }

  if (GEMINI_KEY) {
    try {
      const r = await callGemini(question, facts, profile.name);
      if (r) {
        const g = gradeReply(r.sentences, facts);
        result.gemini = { sentences: r.sentences, ...g, latency: r.latency };
      }
    } catch (e) { result.gemini = { error: e.message }; }
  }

  return result;
}

async function main() {
  console.log(`Grounding test: ${N} conversations, batch size ${BATCH}`);
  if (MODEL_URL) console.log(`  Fine-tuned model: ${MODEL_URL}`);
  else console.log("  Fine-tuned model: skipped (no MODEL_URL)");
  if (GEMINI_KEY) console.log("  Gemini: enabled");
  else console.log("  Gemini: skipped (no GEMINI_API_KEY)");

  const all = [];
  for (let i = 0; i < N; i += BATCH) {
    const batch = Math.min(BATCH, N - i);
    const promises = Array.from({ length: batch }, (_, j) => runOne(i + j));
    const results = await Promise.all(promises);
    all.push(...results);
    process.stdout.write(`  ${all.length}/${N}\r`);
    if (i + BATCH < N) await sleep(300);
  }
  console.log();

  // Aggregate
  const agg = {};
  for (const model of ["finetune", "gemini"]) {
    const a = { sentPass: 0, sentFail: 0, sentRewrite: 0, sentTotal: 0,
                repliesClean: 0, repliesTotal: 0, latencies: [], errors: 0 };
    for (const r of all) {
      const m = r[model];
      if (!m) continue;
      if (m.error) { a.errors++; a.repliesTotal++; continue; }
      a.sentPass += m.good;
      a.sentFail += m.bad;
      a.sentRewrite += m.rewrite;
      a.sentTotal += m.total;
      a.repliesClean += m.replyClean ? 1 : 0;
      a.repliesTotal++;
      if (m.latency) a.latencies.push(m.latency);
    }
    agg[model] = a;
  }

  console.log(`\n=== GROUNDING TEST RESULTS (${N} conversations) ===\n`);

  for (const [label, model] of [["Fine-tuned", "finetune"], ["Gemini", "gemini"]]) {
    const a = agg[model];
    if (a.repliesTotal === 0) { console.log(`${label}: skipped (no key/url)`); continue; }

    const replyCleanPct = ((a.repliesClean / a.repliesTotal) * 100).toFixed(1);
    const sentPassPct = ((a.sentPass / a.sentTotal) * 100).toFixed(1);
    const sentRewritePct = ((a.sentRewrite / a.sentTotal) * 100).toFixed(1);
    const sorted = a.latencies.slice().sort((a, b) => a - b);
    const median = sorted[Math.floor(sorted.length / 2)] || 0;
    const p95 = sorted[Math.floor(sorted.length * 0.95)] || 0;

    console.log(`${label}:`);
    console.log(`  Replies with zero invented numbers: ${a.repliesClean}/${a.repliesTotal} (${replyCleanPct}%)`);
    console.log(`  Sentences passing check: ${a.sentPass}/${a.sentTotal} (${sentPassPct}%)`);
    console.log(`  Sentences needing rewrite: ${a.sentRewrite}/${a.sentTotal} (${sentRewritePct}%)`);
    console.log(`  Latency median: ${median} ms, p95: ${p95} ms`);
    if (a.errors) console.log(`  Errors (timeout/API): ${a.errors}`);
    console.log();
  }

  // Show a few failures for debugging
  for (const model of ["finetune", "gemini"]) {
    const failures = all.filter(r => r[model] && !r[model].error && !r[model].replyClean).slice(0, 5);
    if (failures.length > 0) {
      const label = model === "finetune" ? "Fine-tuned" : "Gemini";
      console.log(`--- ${label} failures (up to 5) ---`);
      for (const f of failures) {
        const m = f[model];
        console.log(`  Q: "${f.question}" -> ${JSON.stringify(m.sentences)}`);
      }
      console.log();
    }
  }

  // Save detailed results
  const outPath = "words/grounding-results.json";
  writeFileSync(outPath, JSON.stringify({ date: new Date().toISOString(), n: N, agg, conversations: all }, null, 2));
  console.log(`Detailed results saved to ${outPath}`);
}

main().catch(console.error);
