import { simulate, simulateDetailed } from "../sim/engine.js";
import { cardForReply } from "./cards.js";
import { lifeChartForQuestion } from "./life-charts.js";

const TOPIC_SAVINGS = /money|save|saving|savings|rich|broke|retire|enough|afford|house|home|buy/i;
const TOPIC_HEALTH = /health|healthy|live|long|old|age|exercise|sleep|die|life expectancy/i;
const TOPIC_CHANGE = /change|start|should|advice|do now|next|difference|worth|quit/i;

// Savings over a lifetime, straight from the simulation: the middle (50th percentile) savings
// at every age among the simulated lives still alive then (sim/engine.js simulateDetailed).
// Replaces a separate fixed-return calculation that disagreed with the simulation (Jeffrey
// measured about $210,000 at 69 on the line vs a $29,000 median at 70 from simulate()).
// With a baseline path, the start-of-session line comes first (the headset draws it dashed).
// Ends at 90 (like "money lasts to 90"); past that few simulated lives are left and the median
// gets jumpy. retire_age (optional) lets the headset label the value at retirement.
export const LINE_END_AGE = 90;
export function savingsLine(path, baselinePath = null, retireAge = null) {
  if (!path?.ages?.length) return null;
  let ages = path.ages.filter((x) => x <= LINE_END_AGE);
  if (baselinePath) ages = ages.filter((x) => baselinePath.ages.includes(x));
  const pick = (pa) => ages.map((x) => pa.median[pa.ages.indexOf(x)]);
  const datasets = [];
  if (baselinePath) datasets.push({ label: "When you started", data: pick(baselinePath) });
  datasets.push({ label: baselinePath ? "Now" : "Projected savings", data: pick(path) });
  const chart = { kind: "line", title: "Your savings over time", labels: ages.map(String), datasets };
  if (Number.isFinite(retireAge) && ages.includes(retireAge)) chart.retire_age = retireAge;
  return chart;
}

// After a headset meter moves (when the newer compare card is off): compare NOW with WHERE THIS
// PERSON STARTED the session, so the chart shows what their own changes did. baseline / now:
// { facts, path }.
export function chartForSlider(name, baseline, now) {
  if (!baseline?.facts || !now?.facts) return null;
  if (name === "saving_per_month") {
    const line = savingsLine(now.path, baseline.path, now.retireAge ?? null);
    if (line) return line;
    return {
      kind: "bar",
      title: "Your changes",
      labels: ["Savings at 70", "Retirement income/yr"],
      datasets: [
        { label: "When you started", data: [baseline.facts.savings_70.median, baseline.facts.income_retired_per_year.median] },
        { label: "Now", data: [now.facts.savings_70.median, now.facts.income_retired_per_year.median] },
      ],
    };
  }
  // Habits: life expectancy as a range, now above where they started (never one age).
  const bl = baseline.facts.life_expectancy;
  const n = now.facts.life_expectancy;
  return {
    kind: "range",
    title: "Life expectancy range",
    labels: ["Now", "When you started"],
    datasets: [
      { label: "Low (10th %ile)", data: [n.low, bl.low] },
      { label: "Median", data: [n.median, bl.median] },
      { label: "High (90th %ile)", data: [n.high, bl.high] },
    ],
  };
}

export function chartForReply(question, profile, facts, path = null) {
  if (!facts || !profile) return null;

  // The newer card kinds (stat, habit) take priority when they are switched on (NEW_CARDS=1); see server/cards.js.
  const card = cardForReply(question, profile, facts);
  if (card) return card;

  // Snapshot, chance, milestones, timeline: for questions about today, lasting, plans and when.
  const life = lifeChartForQuestion(question, profile, facts);
  if (life) return life;

  if (TOPIC_SAVINGS.test(question)) {
    return savingsLine(path ?? simulateDetailed(profile).savingsByAge, null, Number(profile.retirement_age ?? 65));
  }

  if (TOPIC_HEALTH.test(question)) {
    return {
      kind: "range",
      title: "Life expectancy range",
      labels: ["Life expectancy", "Healthy years"],
      datasets: [
        { label: "Low (10th %ile)", data: [facts.life_expectancy.low, facts.healthy_years.low] },
        { label: "Median", data: [facts.life_expectancy.median, facts.healthy_years.median] },
        { label: "High (90th %ile)", data: [facts.life_expectancy.high, facts.healthy_years.high] },
      ],
    };
  }

  if (TOPIC_CHANGE.test(question) && facts.one_change) {
    const nudgedProfile = { ...profile };
    if (facts.one_change.slider === "saving_per_month") {
      nudgedProfile.saving_per_month = (profile.saving_per_month || 0) + 50;
    } else if (facts.one_change.slider === "exercise_per_week") {
      nudgedProfile.habits = { ...profile.habits, exercise_per_week: Math.min((profile.habits?.exercise_per_week || 2) + 2, 7) };
    } else if (facts.one_change.slider === "sleep_hours") {
      nudgedProfile.habits = { ...profile.habits, sleep_hours: 7.5 };
    } else if (facts.one_change.slider === "smoker") {
      nudgedProfile.habits = { ...profile.habits, smoker: false };
    }
    const nudgedFacts = simulate(nudgedProfile);
    return {
      kind: "bar",
      title: `Impact of ${facts.one_change.label}`,
      labels: ["Savings at 70", "Retirement income/yr"],
      datasets: [
        { label: "Current path", data: [facts.savings_70.median, facts.income_retired_per_year.median] },
        { label: `With ${facts.one_change.label}`, data: [nudgedFacts.savings_70.median, nudgedFacts.income_retired_per_year.median] },
      ],
    };
  }

  return null;
}
