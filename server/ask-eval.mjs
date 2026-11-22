// Scores the ask path against real Gemini: does call 1 pick the right tool (and the key argument),
// how long does each step take, and does the final reply pass fill-and-check.
// Run from the repo root:  node --env-file=.env server/ask-eval.mjs  [--write]
// --write also runs call 2 (the writer) and the checker for every question (about twice the calls).
import { understand, compute, writerBrief, templateFor, replyFactsFor } from "./ask.js";
import { reply } from "./brain.js";
import { simulateDetailed } from "../sim/engine.js";

const profile = { name: "Sam", age: 21, sex: "male", province: "ON", income_per_year: 30000, savings: { tfsa: 2000, rrsp: 0, other: 500 }, saving_per_month: 100, retirement_age: 65, habits: { exercise_per_week: 2, sleep_hours: 7, smoker: false, drinks_per_week: 3 } };

// [question, expected tool, optional check on args, optional previous tool for follow-ups]
const BANK = [
  ["How much do I need to invest to have one million dollars when I'm 70?", "solve_goal", (a) => a.unknown === "monthly" && a.target_amount === 1e6 && a.target_age === 70],
  ["How will my investment grow right now?", "project", (a) => !a.changes || !Object.keys(a.changes).length],
  ["What about if I invest double?", "project", (a) => a.changes?.monthly_multiply === 2],
  ["How much would I have at 50?", "project", (a) => a.at_age === 50],
  ["What if I put 5,000 dollars in today?", "project", (a) => a.changes?.lump_now === 5000],
  ["What if I saved 300 a month instead?", "project", (a) => a.changes?.monthly_set === 300],
  ["What if I add another 50 a month?", "project", (a) => a.changes?.monthly_add === 50],
  ["What if I wait five years before I start?", "project", (a) => a.changes?.start_delay_years === 5],
  ["What if I retire at 60 instead?", "project", (a) => a.changes?.retire_age === 60],
  ["What if I take a year off from saving?", "project", (a) => a.changes?.pause_years === 1],
  ["What's my best and worst case?", "project"],
  ["When will I have a hundred thousand dollars?", "solve_goal", (a) => a.unknown === "reach_age" && a.target_amount === 100000],
  ["How much would I need to put in today to have half a million at 65?", "solve_goal", (a) => a.unknown === "lump_now" && a.target_amount === 500000],
  ["How much should I save a month to be pretty sure I hit a million by 65?", "solve_goal", (a) => a.confidence === "likely"],
  ["How much have I saved so far?", "get_position"],
  ["How much TFSA room do I have this year?", "get_position", (a) => a.metric === "tfsa_room"],
  ["What percent of my income am I saving?", "get_position", (a) => a.metric === "saving_rate"],
  ["Will my money last?", "explain_fact", (a) => a.topic === "money_lasts"],
  ["How long will I live?", ["health_effect", "explain_fact"]],
  ["What if I quit drinking?", "health_effect", (a) => a.habit === "drinking"],
  ["What's a TFSA?", "explain_concept"],
  ["How does compound interest work?", "explain_concept"],
  ["Should I buy Tesla stock?", "decline"],
  ["Did we ever get married?", "chat"],
  ["What should I change?", "explain_fact", (a) => a.topic === "one_change"],
  ["And what about at 65?", "project", (a) => a.at_age === 65, { name: "project", args: { changes: { monthly_multiply: 2 } } }],
  ["Okay and what if it was triple?", "project", (a) => a.changes?.monthly_multiply === 3, { name: "project", args: { changes: { monthly_multiply: 2 } } }],
];

const write = process.argv.includes("--write");
const d = simulateDetailed(profile);
let toolOk = 0, argOk = 0, argN = 0, checked = 0, clean = 0;
const ms = { understand: [], compute: [], write: [] };
for (const [q, want, check, last] of BANK) {
  let t = performance.now();
  let tool;
  try {
    tool = await understand(q, { profile, last });
  } catch (err) {
    console.log(`FAIL  ${q}  -> ${err.message}`);
    continue;
  }
  ms.understand.push(performance.now() - t);
  const okTool = [want].flat().includes(tool.name);
  toolOk += okTool;
  let okArgs = "";
  if (check) {
    argN++;
    const ok = okTool && check(tool.args);
    argOk += ok;
    okArgs = ok ? " args ok" : " ARGS WRONG";
  }
  t = performance.now();
  const result = compute(tool, { question: q, profile, facts: d.facts, path: d.savingsByAge });
  ms.compute.push(performance.now() - t);
  let said = "";
  if (write) {
    t = performance.now();
    const r = await reply(q, replyFactsFor(tool, d.facts, result.answer), { name: profile.name, extra: writerBrief(tool, result) });
    ms.write.push(performance.now() - t);
    checked++;
    if (r.source !== "template") clean++;
    said = `  "${(r.source === "template" ? templateFor(tool, result) ?? r.sentences : r.sentences).join(" ")}" (${r.source})`;
  }
  console.log(`${okTool ? "ok  " : "MISS"}  ${q}  -> ${tool.name} ${JSON.stringify(tool.args)}${okArgs}${result.chart ? ` [chart ${result.chart.kind}]` : ""}${said}`);
}
const med = (a) => (a.length ? Math.round([...a].sort((x, y) => x - y)[a.length >> 1]) : null);
const p95 = (a) => (a.length ? Math.round([...a].sort((x, y) => x - y)[Math.min(a.length - 1, Math.floor(a.length * 0.95))]) : null);
console.log(`\ntool right: ${toolOk}/${BANK.length}; key argument right: ${argOk}/${argN}${write ? `; writer passed the checker: ${clean}/${checked}` : ""}`);
console.log(`ms median (p95): understand ${med(ms.understand)} (${p95(ms.understand)}), compute ${med(ms.compute)} (${p95(ms.compute)})${write ? `, write ${med(ms.write)} (${p95(ms.write)})` : ""}`);
