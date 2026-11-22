import { simulate, simulateDetailed } from "../sim/engine.js";

const TOPIC_SAVINGS = /money|save|saving|savings|rich|broke|retire|enough|afford|house|home|buy/i;
const TOPIC_HEALTH = /health|healthy|live|long|old|age|exercise|sleep|die|life expectancy/i;
const TOPIC_CHANGE = /change|start|should|advice|do now|next|difference|worth|quit/i;

// Savings over a lifetime, straight from the simulation: the middle (50th percentile) savings
// at every age among the simulated lives still alive then (sim/engine.js simulateDetailed).
// This replaces a separate fixed-return calculation that could disagree with what Uncle says
// (and was flat: string ages made its loop stop after one year).
// With a baseline path, the start-of-session line comes first (the headset draws it dashed).
export function savingsLine(path, baselinePath = null) {
  if (!path?.ages?.length) return null;
  const ages = baselinePath ? path.ages.filter((a) => baselinePath.ages.includes(a)) : path.ages;
  const pick = (pa) => ages.map((a) => pa.median[pa.ages.indexOf(a)]);
  const datasets = [];
  if (baselinePath) datasets.push({ label: "When you started", data: pick(baselinePath) });
  datasets.push({ label: baselinePath ? "Now" : "Projected savings", data: pick(path) });
  return { kind: "line", title: "Your savings over time", labels: ages.map(String), datasets };
}

function lifeRange(facts) {
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

// After a headset meter moves: compare NOW with WHERE THIS PERSON STARTED the session, so the
// chart shows what their own changes did. baseline / now: { facts, path }.
export function chartForSlider(name, baseline, now) {
  if (!baseline?.facts || !now?.facts) return null;
  if (name === "saving_per_month") {
    const line = savingsLine(now.path, baseline.path);
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
  const b = baseline.facts.life_expectancy;
  const n = now.facts.life_expectancy;
  return {
    kind: "range",
    title: "Life expectancy range",
    labels: ["Now", "When you started"],
    datasets: [
      { label: "Low (10th %ile)", data: [n.low, b.low] },
      { label: "Median", data: [n.median, b.median] },
      { label: "High (90th %ile)", data: [n.high, b.high] },
    ],
  };
}

export function chartForReply(question, profile, facts, path = null) {
  if (!facts || !profile) return null;

  if (TOPIC_SAVINGS.test(question)) {
    return savingsLine(path ?? simulateDetailed(profile).savingsByAge);
  }

  if (TOPIC_HEALTH.test(question)) {
    return lifeRange(facts);
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
