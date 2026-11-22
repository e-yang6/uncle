// Builds xr/sample/charts.json for the chart style page: real chart messages from the server's
// own chart code and a real simulate() run on the sample person in CONTRACTS.md, so no number
// on the style page is made up. The proposed kinds (snapshot, chance, milestones, timeline)
// are built here from the same profile and facts; they're the shapes proposed to Ethan.
// No chart marks a single death age: life expectancy only appears as a range (PLAN.md ethics).
// Run from the repo root: node xr/sample/make-charts.mjs
import { writeFileSync } from "node:fs";
import { simulate } from "../../sim/engine.js";
import { chartForReply } from "../../server/charts.js";

// The sample interview fields from CONTRACTS.md ("Interview fields").
const profile = {
  name: "Ethan", age: 21, sex: "male", province: "ON",
  income_per_year: 30000, savings: { tfsa: 2000, rrsp: 0, other: 500 },
  saving_per_month: 100, retirement_age: 65,
  habits: { exercise_per_week: 2, sleep_hours: 7, smoker: false, drinks_per_week: 3 },
};

export function proposedCharts(p, facts) {
  return {
    snapshot: {
      kind: "snapshot", title: "Saved today",
      labels: ["TFSA", "RRSP", "Other"],
      datasets: [{ label: "Balance", data: [p.savings.tfsa, p.savings.rrsp, p.savings.other] }],
    },
    chance: {
      kind: "chance", title: "Money lasting",
      labels: ["Money lasts to 90"],
      datasets: [{ label: "of simulated lives that reach 90", data: [facts.money_lasts_to_90_chance] }],
    },
    milestones: {
      kind: "milestones", title: "Milestones", now: p.age,
      labels: ["Retirement", "Healthy until about"],
      datasets: [{ label: "Age", data: [p.retirement_age, facts.healthy_years.median] }],
    },
    timeline: {
      kind: "timeline", title: "Your life", now: p.age,
      labels: ["Retire", "Healthy to about"],
      datasets: [{ label: "Age", data: [p.retirement_age, facts.healthy_years.median] }],
    },
  };
}

const facts = simulate(profile);
const out = {
  note: "Sample person from CONTRACTS.md; numbers from one simulate() run and server/charts.js. Regenerate with node xr/sample/make-charts.mjs.",
  made_at: new Date().toISOString(),
  profile,
  charts: {
    line: chartForReply("how much will I have saved?", profile, facts),
    range: chartForReply("how healthy will I be?", profile, facts),
    bar: chartForReply("what should I change?", profile, facts),
    ...proposedCharts(profile, facts),
  },
};
for (const [k, v] of Object.entries(out.charts)) if (!v) throw new Error(`server returned no ${k} chart`);
writeFileSync(new URL("charts.json", import.meta.url), JSON.stringify(out, null, 2) + "\n");
console.log(Object.entries(out.charts).map(([k, c]) => `${k}: ${c.kind} "${c.title}"`).join("\n"));
