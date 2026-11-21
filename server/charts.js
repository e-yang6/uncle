// Decide whether a reply topic deserves a floating chart, and build the chart data.
// Called after each reply; returns null or a chart message matching CONTRACTS.md:
// { kind: "line"|"bar"|"range", title, labels, datasets }
import { simulate } from "../sim/engine.js";

const TOPIC_SAVINGS = /money|save|saving|savings|rich|broke|retire|enough|afford|house|home|buy/i;
const TOPIC_HEALTH = /health|healthy|live|long|old|age|exercise|sleep|die|life expectancy/i;
const TOPIC_CHANGE = /change|start|should|advice|do now|next|difference|worth|quit/i;

// A quick deterministic projection of savings year by year (no randomness, median returns).
function savingsPath(profile, facts) {
  const age = profile.age || 20;
  const saving = (profile.saving_per_month || 0) * 12;
  const retireAge = profile.retirement_age || 65;
  let savings = (profile.savings?.tfsa || 0) + (profile.savings?.rrsp || 0) + (profile.savings?.other || 0);
  const realReturn = 0.04; // conservative median real return
  const labels = [];
  const data = [];
  for (let y = age; y <= 80; y += 5) {
    for (let a = (labels.length === 0 ? age : labels[labels.length - 1] + 1); a <= y; a++) {
      if (a < retireAge) {
        savings = savings * (1 + realReturn) + saving;
      } else {
        const withdraw = Math.max(0, (profile.income_per_year || 55000) * 0.7 * 0.5);
        savings = Math.max(0, savings * (1 + realReturn) - withdraw);
      }
    }
    labels.push(String(y));
    data.push(Math.round(savings));
  }
  return { labels, data };
}

export function chartForReply(question, profile, facts) {
  if (!facts || !profile) return null;

  if (TOPIC_SAVINGS.test(question)) {
    const path = savingsPath(profile, facts);
    return {
      kind: "line",
      title: "Your savings over time",
      labels: path.labels,
      datasets: [
        { label: "Projected savings", data: path.data },
      ],
    };
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
