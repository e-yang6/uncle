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

// Random numbers. Every simulated life gets its own seeded stream (life i uses seed + i), so
// rerunning with one input changed (a slider) gives each life the same market years and the
// same luck: the difference between two runs is the effect of the change, not noise
// ("common random numbers"). Before this, the same person's gain from saving $50 more a month
// came out +$78k on one run and +$806 on the next.
export const DEFAULT_SEED = 20261121;
let rand = Math.random;

// mulberry32: small, fast, good enough for Monte Carlo draws.
export function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Simple Box-Muller for normal random numbers
function randn() {
  let u, v;
  do { u = rand(); } while (u === 0);
  v = rand();
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

function simulateOneLife(input, path = null) {
  const stockFrac = DEFAULT_STOCK_FRAC;
  const bondFrac = 1 - stockFrac;

  const qxBase = input.sex === "female" ? QX_FEMALE : QX_MALE;
  const habitRR =
    (input.habits.smoker ? SMOKING_RR : 1.0) *
    exerciseRR(input.habits.exercise_per_week) *
    sleepRR(input.habits.sleep_hours) *
    alcoholRR(input.habits.drinks_per_week);

  // Optional what-if inputs (server/ask.js tools): a one-time amount today, a later start, a break
  // from saving, and a change in income. All default to "no change".
  let savings = input.savings.tfsa + input.savings.rrsp + input.savings.other + Math.max(0, Number(input.lump_now) || 0);
  let income = input.income_per_year * (1 + (Number(input.income_change_pct) || 0) / 100);
  const annualSaving = input.saving_per_month * 12;
  const startAge = input.age + Math.max(0, Number(input.start_delay_years) || 0);
  const pauseFrom = Number(input.pause?.from_age);
  const pauseTo = Number.isFinite(pauseFrom) ? pauseFrom + Math.max(0, Number(input.pause?.years) || 0) : -1;
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
    if (rand() < qx) {
      deathAge = age;
      alive = false;
      break;
    }

    const stockReturn = drawReturn(STOCK_REAL_MEAN, STOCK_REAL_STD);
    const bondReturn = drawReturn(BOND_REAL_MEAN, BOND_REAL_STD);
    const portfolioReturn = stockFrac * stockReturn + bondFrac * bondReturn;

    if (age < retireAge) {
      // Every dollar saved counts. It used to be capped at TFSA + RRSP room, so money saved above the
      // room vanished and "what if I save double" could show no gain. Saving above the room goes to an
      // ordinary account; tax on that account's growth is not modelled yet (said on screen and in words).
      const saving = age >= startAge && !(age >= pauseFrom && age < pauseTo);
      const contrib = saving ? annualSaving : 0;
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
    if (path) path.push(savings); // savings at the end of this age, while alive
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

function runLives(input, numLives, { seed = DEFAULT_SEED, withPath = false } = {}) {
  const deaths = [];
  const savings70 = [];
  const incomes = [];
  const healthy = [];
  let moneyAt90 = 0;
  let survivedTo90 = 0;

  const byAge = withPath ? [] : null; // byAge[k] = savings of every life still alive at age input.age + k
  for (let i = 0; i < numLives; i++) {
    rand = seed === null ? Math.random : mulberry32(seed + i);
    const path = withPath ? [] : null;
    const life = simulateOneLife(input, path);
    if (path) path.forEach((v, k) => (byAge[k] ??= []).push(v));
    deaths.push(life.deathAge);
    if (life.savingsAt70 !== null) savings70.push(life.savingsAt70);
    incomes.push(life.retiredIncome);
    healthy.push(life.healthyYears);
    if (life.moneyAt90 !== null) {
      survivedTo90++;
      moneyAt90 += life.moneyAt90;
    }
  }

  rand = Math.random;
  const lasts90 = survivedTo90 > 0 ? Math.round((moneyAt90 / survivedTo90) * 100) / 100 : 0;

  const core = {
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
  // Display-only quartiles: keep them out of JSON facts and the model's placeholder keys.
  Object.defineProperty(core, "chartRanges", { value:Object.fromEntries([
    ["savings_70", savings70], ["income_retired_per_year", incomes],
    ["life_expectancy", deaths], ["healthy_years", healthy],
  ].map(([key,values])=>[key,{low:Math.round(percentile(values,.25)), high:Math.round(percentile(values,.75))}])) });
  if (!withPath) return { core, path: null };
  // Savings by age among the lives still alive at that age (like savings_70): 10th/50th/90th.
  const ages = [], low = [], median = [], high = [];
  const sortedByAge = new Map();
  byAge.forEach((vals, k) => {
    if (vals.length < numLives * 0.05) return; // too few lives left for a fair percentile
    const sorted = Float64Array.from(vals).sort(); // typed-array sort is numeric and much faster
    sortedByAge.set(input.age + k, sorted);
    const at = (q) => sorted[Math.round(q * (sorted.length - 1))];
    ages.push(input.age + k);
    low.push(Math.round(at(0.1)));
    median.push(Math.round(at(0.5)));
    high.push(Math.round(at(0.9)));
  });
  const path = { ages, low, median, high };
  // Share of lives alive at that age with at least this much saved (not enumerable: stays out of JSON).
  Object.defineProperty(path, "chanceAtLeast", {
    value(age, amount) {
      const sorted = sortedByAge.get(age);
      if (!sorted) return null;
      let lo = 0, hi = sorted.length;
      while (lo < hi) { const mid = (lo + hi) >> 1; if (sorted[mid] < amount) lo = mid + 1; else hi = mid; }
      return (sorted.length - lo) / sorted.length;
    },
  });
  return { core, path };
}

// Facts sheet plus savings by age (10th/50th/90th percentile at every age, among lives still
// alive). The path is kept out of the facts sheet so it never turns into placeholders.
export function simulateDetailed(inputFields, { numLives = 5000, seed = DEFAULT_SEED } = {}) {
  const input = merge(DEFAULTS, inputFields || {});
  const { core, path } = runLives(input, numLives, { seed, withPath: true });
  return { facts: buildFacts(input, core, seed), savingsByAge: path };
}

// Savings by age only (no facts sheet, no ranking of changes): the fast run the what-if tools repeat.
export function simulatePath(inputFields, { numLives = 5000, seed = DEFAULT_SEED } = {}) {
  const input = merge(DEFAULTS, inputFields || {});
  return runLives(input, numLives, { seed, withPath: true }).path;
}

export function simulate(inputFields, { numLives = 5000, seed = DEFAULT_SEED } = {}) {
  const input = merge(DEFAULTS, inputFields || {});
  const { core } = runLives(input, numLives, { seed });
  return buildFacts(input, core, seed);
}

function buildFacts(input, core, seed) {

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

  Object.defineProperty(facts, "chartRanges", {value:core.chartRanges});
  facts.one_change = rankBestChange(input, seed);

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

function rankBestChange(input, seed = DEFAULT_SEED) {
  let best = null;
  let bestScore = 0;
  // Compare like with like: the same 1,000 seeded lives with and without each nudge.
  const baseFacts = runLives(input, 1000, { seed }).core;

  for (const { slider, nudge, label } of SLIDER_NUDGES) {
    const nudged = nudge(input);
    if (JSON.stringify(nudged) === JSON.stringify(input)) continue;

    const nudgedFacts = runLives(merge(DEFAULTS, nudged), 1000, { seed }).core;
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
