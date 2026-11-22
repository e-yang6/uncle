import { simulate } from "../sim/engine.js";
import { cardForReply } from "./cards.js";
import {
  STOCK_REAL_MEAN, BOND_REAL_MEAN,
  CPP_MAX_MONTHLY, CPP_CONTRIB_YEARS_FULL, OAS_MAX_MONTHLY,
  TFSA_ANNUAL_LIMIT, RRSP_RATE, RRSP_ANNUAL_MAX,
  REAL_WAGE_GROWTH, DEFAULT_STOCK_FRAC,
} from "../sim/data.js";

const TOPIC_SAVINGS = /money|save|saving|savings|rich|broke|retire|enough|afford|house|home|buy/i;
const TOPIC_HEALTH = /health|healthy|live|long|old|age|exercise|sleep|die|life expectancy/i;
const TOPIC_CHANGE = /change|start|should|advice|do now|next|difference|worth|quit/i;

function savingsPath(profile) {
  const age = profile.age || 20;
  const annualSaving = (profile.saving_per_month || 0) * 12;
  const retireAge = profile.retirement_age || 65;
  let savings = (profile.savings?.tfsa || 0) + (profile.savings?.rrsp || 0) + (profile.savings?.other || 0);
  let income = profile.income_per_year || 55000;
  const medianReturn = DEFAULT_STOCK_FRAC * STOCK_REAL_MEAN + (1 - DEFAULT_STOCK_FRAC) * BOND_REAL_MEAN;
  const yearsWorked = Math.max(0, age - 18);
  const totalWorked = yearsWorked + (retireAge - age);
  const cppFrac = Math.min(Math.max(totalWorked, 0) / CPP_CONTRIB_YEARS_FULL, 1);
  const govIncome = (CPP_MAX_MONTHLY * cppFrac + OAS_MAX_MONTHLY) * 12;
  const labels = [];
  const data = [];
  for (let y = age; y <= 80; y += 5) {
    for (let a = (labels.length === 0 ? age : Number(labels[labels.length - 1]) + 1); a <= y; a++) {
      if (a < retireAge) {
        const maxRRSP = Math.min(income * RRSP_RATE, RRSP_ANNUAL_MAX);
        const maxContrib = TFSA_ANNUAL_LIMIT + maxRRSP;
        const contrib = Math.min(annualSaving, maxContrib);
        savings = savings * (1 + medianReturn) + contrib;
        income *= (1 + REAL_WAGE_GROWTH);
      } else {
        const targetSpend = income * 0.70;
        const withdrawal = Math.max(0, targetSpend - govIncome);
        savings = Math.max(0, savings * (1 + medianReturn) - withdrawal);
      }
    }
    labels.push(String(y));
    data.push(Math.round(savings));
  }
  return { labels, data };
}

export function chartForReply(question, profile, facts) {
  if (!facts || !profile) return null;

  // The newer card kinds (stat, habit) take priority when they are switched on (NEW_CARDS=1); see server/cards.js.
  const card = cardForReply(question, profile, facts);
  if (card) return card;

  if (TOPIC_SAVINGS.test(question)) {
    const path = savingsPath(profile);
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
