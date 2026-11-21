// Scores Gemini's interview reading against transcripts whose true answers are known.
//   node --env-file=.env voice/extract-eval.mjs [cases.json]
// Per field it counts: right, wrong value, made-up (filled a field the speaker never said),
// missed (left empty though it was said). A made-up value is the dangerous one: it would feed the
// simulation something the person never told us.
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import { extractFields } from "./interview.js";

const file = process.argv[2] ?? fileURLToPath(new URL("./extract-eval-cases.json", import.meta.url));
const { note, cases } = JSON.parse(fs.readFileSync(file, "utf8"));
const FIELDS = ["name", "age", "sex", "province", "income_per_year", "tfsa", "rrsp", "other_savings", "saving_per_month", "retirement_age", "exercise_per_week", "sleep_hours", "smoker", "drinks_per_week"];

const flat = (h) => ({ ...h, ...(h.savings ?? {}), ...(h.habits ?? {}), other_savings: h.savings?.other ?? h.other_savings });
const same = (a, b) => (typeof a === "number" && typeof b === "number" ? Math.abs(a - b) <= Math.max(0.01, Math.abs(b) * 0.02) : String(a).toLowerCase() === String(b).toLowerCase());

const tally = { right: 0, wrong: 0, madeUp: 0, missed: 0, correctlyEmpty: 0 };
const problems = [];
for (const c of cases) {
  let got;
  try {
    got = flat((await extractFields({ transcript: c.transcript })).heard);
  } catch (err) {
    problems.push(`case ${c.id}: ERROR ${err.message}`);
    continue;
  }
  for (const f of FIELDS) {
    const truth = c.truth[f] ?? null;
    const g = got[f] ?? null;
    if (truth === null && g === null) tally.correctlyEmpty++;
    else if (truth === null) (tally.madeUp++, problems.push(`case ${c.id} MADE UP ${f}=${JSON.stringify(g)}`));
    else if (g === null) (tally.missed++, problems.push(`case ${c.id} missed ${f} (said ${JSON.stringify(truth)})`));
    else if (same(g, truth)) tally.right++;
    else (tally.wrong++, problems.push(`case ${c.id} WRONG ${f}: got ${JSON.stringify(g)}, said ${JSON.stringify(truth)}`));
  }
}
const said = tally.right + tally.wrong + tally.missed;
const total = said + tally.madeUp + tally.correctlyEmpty;
console.log(note ?? "");
console.log(`${cases.length} interviews, ${total} field checks (${said} actually said, ${total - said} not said)`);
console.log(`said fields: ${tally.right} right, ${tally.wrong} wrong value, ${tally.missed} missed  -> ${((100 * tally.right) / said).toFixed(1)}% right`);
console.log(`not-said fields: ${tally.madeUp} made up, ${tally.correctlyEmpty} correctly left empty -> ${tally.madeUp} invented values`);
console.log(problems.join("\n"));
