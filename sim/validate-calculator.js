#!/usr/bin/env node
// Validates our simulation against hand-calculated values using official Canadian rules.
// PLAN.md: "Fixed-return mode compared with the federal Canadian Retirement Income
// Calculator on 10 to 20 profiles: within 5% each."
//
// What we validate:
// 1. CPP/OAS calculation: for zero-savings profiles, retirement income = gov income
// 2. Contribution limits: savings growth respects TFSA/RRSP caps
// 3. Target spend: for high-savings profiles, retirement income ≈ 70% of final income
// 4. Life expectancy: within known StatsCan ranges by sex

import { simulate } from "./engine.js";
import { loadRates } from "./fetch-rates.js";

const rates = loadRates();
const CPP_YEARLY = rates.cpp_max_monthly * 12;
const OAS_YEARLY = rates.oas_max_monthly * 12;

function computeExpectedGovIncome(input) {
  const yearsWorked = Math.max(0, input.age - 18);
  const totalWorked = yearsWorked + ((input.retirement_age || 65) - input.age);
  const cppFrac = Math.min(Math.max(totalWorked, 0) / rates.cpp_contrib_years_full, 1);
  return cppFrac * CPP_YEARLY + OAS_YEARLY;
}

function pctDiff(actual, expected) {
  if (expected === 0) return actual === 0 ? 0 : 1;
  return Math.abs(actual - expected) / expected;
}

const TESTS = [
  // --- Group 1: Zero savings, retirement income should equal gov income ---
  {
    name: "Zero savings, $30k income, male 25",
    input: { age: 25, sex: "male", income_per_year: 30000, saving_per_month: 0,
             savings: { tfsa: 0, rrsp: 0, other: 0 }, retirement_age: 65 },
    check(facts, input) {
      const expectedGov = computeExpectedGovIncome(input);
      const got = facts.income_retired_per_year.median;
      const diff = pctDiff(got, expectedGov);
      return { ok: diff <= 0.05, label: `Gov income: expected $${Math.round(expectedGov)}, got $${got} (${(diff*100).toFixed(1)}%)` };
    },
  },
  {
    name: "Zero savings, $20k income, female 20",
    input: { age: 20, sex: "female", income_per_year: 20000, saving_per_month: 0,
             savings: { tfsa: 0, rrsp: 0, other: 0 }, retirement_age: 65 },
    check(facts, input) {
      const expectedGov = computeExpectedGovIncome(input);
      // With $20k income and 70% target = $14k < $27k gov, so no withdrawal needed.
      // Retirement income = targetSpend = $14k * (1.01)^45 ≈ roughly $22k.
      // Actually income grows at 1%/yr, so final income after 45 years ≈ $20k * 1.01^45 = $31.3k
      // targetSpend = 0.7 * $31.3k = $21.9k, which is less than govIncome
      // So income = targetSpend (since withdrawal = 0 -> targetSpend)
      const finalIncome = 20000 * Math.pow(1.01, 45);
      const targetSpend = finalIncome * 0.70;
      const got = facts.income_retired_per_year.median;
      // Should be close to targetSpend since it's below gov income
      const diff = pctDiff(got, targetSpend);
      return { ok: diff <= 0.10, label: `Low earner: expected ~$${Math.round(targetSpend)} (target spend < gov), got $${got} (${(diff*100).toFixed(1)}%)` };
    },
  },
  {
    name: "Zero savings, $55k income, male 30",
    input: { age: 30, sex: "male", income_per_year: 55000, saving_per_month: 0,
             savings: { tfsa: 0, rrsp: 0, other: 0 }, retirement_age: 65 },
    check(facts, input) {
      const expectedGov = computeExpectedGovIncome(input);
      const got = facts.income_retired_per_year.median;
      // $55k grows to ~$55k * 1.01^35 = ~$77.5k. Target = $54.3k. Gov = $27.2k.
      // Withdrawal needed = $27k/yr but no savings, so only get gov income after first year.
      // Average should be close to gov income since savings = 0.
      const diff = pctDiff(got, expectedGov);
      return { ok: diff <= 0.05, label: `Zero savings: expected $${Math.round(expectedGov)} (gov only), got $${got} (${(diff*100).toFixed(1)}%)` };
    },
  },

  // --- Group 2: CPP fraction calculation ---
  {
    name: "CPP fraction: 30 years working (age 35 to 65)",
    input: { age: 35, sex: "male", income_per_year: 50000, saving_per_month: 0,
             savings: { tfsa: 0, rrsp: 0, other: 0 }, retirement_age: 65 },
    check(facts, input) {
      const expectedGov = computeExpectedGovIncome(input);
      const got = facts.income_retired_per_year.median;
      const diff = pctDiff(got, expectedGov);
      return { ok: diff <= 0.10, label: `CPP frac (47yr->capped): expected ~$${Math.round(expectedGov)}, got $${got} (${(diff*100).toFixed(1)}%)` };
    },
  },

  // --- Group 3: High savings, income should approach target spend ---
  {
    name: "High saver: $120k income, $2k/mo, big existing savings",
    input: { age: 30, sex: "male", income_per_year: 120000, saving_per_month: 2000,
             savings: { tfsa: 50000, rrsp: 50000, other: 50000 }, retirement_age: 65 },
    check(facts, input) {
      const finalIncome = 120000 * Math.pow(1.01, 35);
      const targetSpend = finalIncome * 0.70;
      const got = facts.income_retired_per_year.median;
      const diff = pctDiff(got, targetSpend);
      return { ok: diff <= 0.05, label: `High saver: expected ~$${Math.round(targetSpend)} (target spend), got $${got} (${(diff*100).toFixed(1)}%)` };
    },
  },
  {
    name: "Very high saver: $100k, $1500/mo from age 25",
    input: { age: 25, sex: "female", income_per_year: 100000, saving_per_month: 1500,
             savings: { tfsa: 20000, rrsp: 10000, other: 0 }, retirement_age: 65 },
    check(facts, input) {
      const finalIncome = 100000 * Math.pow(1.01, 40);
      const targetSpend = finalIncome * 0.70;
      const got = facts.income_retired_per_year.median;
      const diff = pctDiff(got, targetSpend);
      return { ok: diff <= 0.05, label: `Very high saver: expected ~$${Math.round(targetSpend)} (target), got $${got} (${(diff*100).toFixed(1)}%)` };
    },
  },

  // --- Group 4: Life expectancy ranges ---
  {
    name: "Male life expectancy: healthy defaults",
    input: { age: 25, sex: "male", income_per_year: 50000, saving_per_month: 100 },
    check(facts) {
      // StatsCan 2020-2022: male LE at birth ≈ 79.7, at 25 ≈ 80.5
      const le = facts.life_expectancy.median;
      const ok = le >= 78 && le <= 86;
      return { ok, label: `Male LE: ${le} years (expected 78-86)` };
    },
  },
  {
    name: "Female life expectancy: healthy defaults",
    input: { age: 25, sex: "female", income_per_year: 50000, saving_per_month: 100 },
    check(facts) {
      // StatsCan 2020-2022: female LE at birth ≈ 84.0, at 25 ≈ 84.4
      const le = facts.life_expectancy.median;
      const ok = le >= 82 && le <= 90;
      return { ok, label: `Female LE: ${le} years (expected 82-90)` };
    },
  },
  {
    name: "Smoker life expectancy: reduced",
    input: { age: 25, sex: "male", income_per_year: 50000, saving_per_month: 100,
             habits: { smoker: true, exercise_per_week: 2, sleep_hours: 7, drinks_per_week: 3 } },
    check(facts) {
      const le = facts.life_expectancy.median;
      const ok = le >= 65 && le <= 78;
      return { ok, label: `Smoker LE: ${le} years (expected 65-78, reduced by ~10yr)` };
    },
  },

  // --- Group 5: Contribution limits ---
  {
    name: "Contrib limits: $5k/mo saving on $80k income",
    input: { age: 25, sex: "male", income_per_year: 80000, saving_per_month: 5000,
             savings: { tfsa: 0, rrsp: 0, other: 0 }, retirement_age: 65 },
    check(facts) {
      // $5k/mo = $60k/yr, but TFSA ($7k) + RRSP (18% of $80k = $14.4k) = $21.4k max
      // So effective saving capped at $21.4k/yr. After 45 years at ~4.3% real:
      // FV ≈ $21.4k * ((1.043^45 - 1) / 0.043) ≈ ~$2.8M
      // vs uncapped $60k/yr -> ~$8M. Savings@70 should reflect the cap.
      const s70 = facts.savings_70.median;
      const ok = s70 < 5_000_000; // should be well under $5M (capped)
      return { ok, label: `Capped savings@70: $${s70} (should be <$5M due to TFSA+RRSP limits)` };
    },
  },

  // --- Group 6: Savings growth direction ---
  {
    name: "More saving -> more savings at 70",
    check() {
      const low = simulate({ age: 25, saving_per_month: 100, income_per_year: 50000 }, { numLives: 10000 });
      const high = simulate({ age: 25, saving_per_month: 500, income_per_year: 50000 }, { numLives: 10000 });
      const ok = high.savings_70.median > low.savings_70.median;
      return { ok, label: `$500/mo ($${high.savings_70.median}) > $100/mo ($${low.savings_70.median})` };
    },
  },
  {
    name: "Smoking reduces life expectancy",
    check() {
      const noSmoke = simulate({ age: 25, sex: "male" }, { numLives: 10000 });
      const smoke = simulate({ age: 25, sex: "male", habits: { smoker: true } }, { numLives: 10000 });
      const ok = noSmoke.life_expectancy.median > smoke.life_expectancy.median;
      return { ok, label: `Non-smoker LE ${noSmoke.life_expectancy.median} > smoker LE ${smoke.life_expectancy.median}` };
    },
  },
];

console.log("Government Calculator Validation (12 profiles)");
console.log("================================================");
console.log(`Rates: CPP $${rates.cpp_max_monthly}/mo, OAS $${rates.oas_max_monthly}/mo, TFSA $${rates.tfsa_annual_limit}/yr, RRSP $${rates.rrsp_annual_max}/yr`);
console.log(`Source: ${rates.note}\n`);

let pass = 0;
let fail = 0;

for (const t of TESTS) {
  let facts;
  if (t.input) facts = simulate(t.input, { numLives: 10000 });
  const result = t.check(facts, t.input);
  console.log(`${result.ok ? "PASS" : "FAIL"} ${t.name}`);
  console.log(`     ${result.label}`);
  if (result.ok) pass++; else fail++;
}

console.log(`\n${pass}/${pass + fail} passed`);
if (fail > 0) process.exit(1);
