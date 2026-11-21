import {
  QX_MALE, QX_FEMALE,
  SMOKING_RR, exerciseRR, sleepRR, alcoholRR, healthyFraction,
  STOCK_REAL_MEAN, STOCK_REAL_STD, BOND_REAL_MEAN, BOND_REAL_STD,
  INFLATION_MEAN, REAL_WAGE_GROWTH,
  CPP_MAX_MONTHLY, CPP_CONTRIB_YEARS_FULL, OAS_MAX_MONTHLY,
  TFSA_ANNUAL_LIMIT, RRSP_RATE, RRSP_ANNUAL_MAX,
  DEFAULT_STOCK_FRAC,
} from "./data.js";
import { loadRates } from "./fetch-rates.js";

const DEFAULTS = {
  name: "Person", age: 20, sex: "male", province: "ON",
  income_per_year: 55000,
  savings: { tfsa: 0, rrsp: 0, other: 0 },
  saving_per_month: 0, retirement_age: 65,
  habits: { exercise_per_week: 2, sleep_hours: 7, smoker: false, drinks_per_week: 3 },
};

function stripNulls(obj) {
  const out = {};
  for (const k of Object.keys(obj)) {
    if (obj[k] != null) out[k] = obj[k];
  }
  return out;
}

function merge(defaults, input) {
  const out = { ...defaults };
  for (const k of Object.keys(input)) {
    if (input[k] != null && typeof input[k] === "object" && !Array.isArray(input[k])) {
      out[k] = { ...defaults[k], ...stripNulls(input[k]) };
    } else if (input[k] != null) {
      out[k] = input[k];
    }
  }
  return out;
}

// Simple Box-Muller for normal random numbers
function randn() {
  let u, v;
  do { u = Math.random(); } while (u === 0);
  v = Math.random();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

function drawReturn(mean, std) {
  return mean + std * randn();
}

function percentile(arr, p) {
  const sorted = arr.slice().sort((a, b) => a - b);
  const i = p * (sorted.length - 1);
  const lo = Math.floor(i);
  const hi = Math.ceil(i);
  if (lo === hi) return sorted[lo];
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (i - lo);
}

function simulateOneLife(input) {
  const stockFrac = DEFAULT_STOCK_FRAC;
  const bondFrac = 1 - stockFrac;

  const qxBase = input.sex === "female" ? QX_FEMALE : QX_MALE;
  const habitRR =
    (input.habits.smoker ? SMOKING_RR : 1.0) *
    exerciseRR(input.habits.exercise_per_week) *
    sleepRR(input.habits.sleep_hours) *
    alcoholRR(input.habits.drinks_per_week);

  let savings = input.savings.tfsa + input.savings.rrsp + input.savings.other;
  let income = input.income_per_year;
  const annualSaving = input.saving_per_month * 12;
  const retireAge = input.retirement_age;
  let alive = true;
  let deathAge = 100;
  const hFrac = healthyFraction(input.habits);

  const yearsWorked = Math.max(0, input.age - 18);
  const totalWorked = yearsWorked + (retireAge - input.age);
  const cppFrac = Math.min(Math.max(totalWorked, 0) / CPP_CONTRIB_YEARS_FULL, 1);
  const govIncome = (CPP_MAX_MONTHLY * cppFrac + OAS_MAX_MONTHLY) * 12;

  let savingsAt70 = 0;
  let retiredIncomeTotal = 0;
  let retiredYears = 0;

  for (let age = input.age; age <= 100 && alive; age++) {
    const qx = Math.min(qxBase[Math.min(age, 100)] * habitRR, 0.99);
    if (Math.random() < qx) {
      deathAge = age;
      alive = false;
      break;
    }

    const stockReturn = drawReturn(STOCK_REAL_MEAN, STOCK_REAL_STD);
    const bondReturn = drawReturn(BOND_REAL_MEAN, BOND_REAL_STD);
    const portfolioReturn = stockFrac * stockReturn + bondFrac * bondReturn;

    if (age < retireAge) {
      const maxRRSP = Math.min(income * RRSP_RATE, RRSP_ANNUAL_MAX);
      const maxContrib = TFSA_ANNUAL_LIMIT + maxRRSP;
      const contrib = Math.min(annualSaving, maxContrib);
      savings = savings * (1 + portfolioReturn) + contrib;
      income *= (1 + REAL_WAGE_GROWTH);
    } else {
      const targetSpend = income * 0.70;
      const withdrawal = Math.max(0, targetSpend - govIncome);
      savings = savings * (1 + portfolioReturn) - withdrawal;
      if (savings < 0) savings = 0;
      const actualIncome = govIncome + Math.min(withdrawal, savings > 0 ? withdrawal : 0);
      retiredIncomeTotal += savings > 0 || withdrawal === 0 ? targetSpend : govIncome;
      retiredYears++;
    }

    if (age === 70) savingsAt70 = savings;
  }

  const reachedAge70 = alive || deathAge > 70;
  const retiredIncome = retiredYears > 0 ? retiredIncomeTotal / retiredYears : govIncome;
  const survivedTo90 = alive || deathAge >= 90;

  return {
    deathAge,
    savingsAt70: reachedAge70 ? savingsAt70 : null,
    retiredIncome,
    healthyYears: Math.round(deathAge * hFrac),
    moneyAt90: survivedTo90 ? (savings > 0 ? 1 : 0) : null,
  };
}

function runLives(input, numLives) {
  const deaths = [];
  const savings70 = [];
  const incomes = [];
  const healthy = [];
  let moneyAt90 = 0;
  let survivedTo90 = 0;

  for (let i = 0; i < numLives; i++) {
    const life = simulateOneLife(input);
    deaths.push(life.deathAge);
    if (life.savingsAt70 !== null) savings70.push(life.savingsAt70);
    incomes.push(life.retiredIncome);
    healthy.push(life.healthyYears);
    if (life.moneyAt90 !== null) {
      survivedTo90++;
      moneyAt90 += life.moneyAt90;
    }
  }

  const lasts90 = survivedTo90 > 0 ? Math.round((moneyAt90 / survivedTo90) * 100) / 100 : 0;

  return {
    savings_70: {
      low: Math.round(percentile(savings70, 0.1)),
      median: Math.round(percentile(savings70, 0.5)),
      high: Math.round(percentile(savings70, 0.9)),
    },
    income_retired_per_year: {
      low: Math.round(percentile(incomes, 0.1)),
      median: Math.round(percentile(incomes, 0.5)),
      high: Math.round(percentile(incomes, 0.9)),
    },
    money_lasts_to_90_chance: lasts90,
    life_expectancy: {
      low: Math.round(percentile(deaths, 0.1)),
      median: Math.round(percentile(deaths, 0.5)),
      high: Math.round(percentile(deaths, 0.9)),
    },
    healthy_years: {
      low: Math.round(percentile(healthy, 0.1)),
      median: Math.round(percentile(healthy, 0.5)),
      high: Math.round(percentile(healthy, 0.9)),
    },
  };
}

export function simulate(inputFields, { numLives = 5000 } = {}) {
  const input = merge(DEFAULTS, inputFields || {});
  const core = runLives(input, numLives);

  const rates = loadRates();
  const fetchedAt = rates.fetched_at || "2026-11-21T00:00:00Z";
  const src = rates.sources || {};
  const facts = {
    ...core,
    apparent_age_at_70: 70,
    one_change: null,
    sources: [
      { value: "life_tables", url: "https://www150.statcan.gc.ca/t1/tbl1/en/tv.action?pid=1310011401", fetched_at: "2026-11-21T00:00:00Z" },
      { value: "cpp_max", url: src.cpp?.url || "https://www.canada.ca/en/services/benefits/publicpensions/cpp.html", fetched_at: fetchedAt },
      { value: "oas_max", url: src.oas?.url || "https://www.canada.ca/en/services/benefits/publicpensions/cpp/old-age-security.html", fetched_at: fetchedAt },
      { value: "tfsa_limit", url: src.tfsa?.url || "https://www.canada.ca/en/revenue-agency/services/tax/individuals/topics/tax-free-savings-account.html", fetched_at: fetchedAt },
      { value: "rrsp_limit", url: src.rrsp?.url || "https://www.canada.ca/en/revenue-agency/services/tax/registered-plans-administrators/pspa/mp-rrsp-dpsp-tfsa-limits-ympe.html", fetched_at: fetchedAt },
      { value: "returns", url: "https://www.credit-suisse.com/about-us/en/reports-research/global-investment-returns-yearbook.html", fetched_at: "2026-11-21T00:00:00Z" },
    ],
  };

  facts.one_change = rankBestChange(input, core);

  const baseLE = input.sex === "female" ? 84 : 80;
  const leDiff = facts.life_expectancy.median - baseLE;
  facts.apparent_age_at_70 = Math.round(70 - leDiff * 0.3);

  return facts;
}

const SLIDER_NUDGES = [
  { slider: "saving_per_month", nudge: (input) => ({ ...input, saving_per_month: input.saving_per_month + 50 }), label: (input) => `saving $${input.saving_per_month + 50 - input.saving_per_month} more a month` },
  { slider: "exercise_per_week", nudge: (input) => ({ ...input, habits: { ...input.habits, exercise_per_week: Math.min(input.habits.exercise_per_week + 2, 7) } }), label: () => "exercising twice more a week" },
  { slider: "sleep_hours", nudge: (input) => ({ ...input, habits: { ...input.habits, sleep_hours: 7.5 } }), label: () => "getting seven to eight hours of sleep" },
  { slider: "smoker", nudge: (input) => ({ ...input, habits: { ...input.habits, smoker: false } }), label: () => "quitting smoking" },
];

function rankBestChange(input, baseFacts) {
  let best = null;
  let bestScore = 0;

  for (const { slider, nudge, label } of SLIDER_NUDGES) {
    const nudged = nudge(input);
    if (JSON.stringify(nudged) === JSON.stringify(input)) continue;

    const nudgedFacts = runLives(merge(DEFAULTS, nudged), 1000);
    const savingsGain = nudgedFacts.savings_70.median - baseFacts.savings_70.median;
    const yearsGain = nudgedFacts.life_expectancy.median - baseFacts.life_expectancy.median;
    const score = savingsGain / 50000 + yearsGain;

    if (score > bestScore) {
      bestScore = score;
      best = { slider, label: label(input) };
    }
  }

  return best || { slider: "saving_per_month", label: "saving $50 more a month" };
}
