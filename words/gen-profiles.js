import { simulate } from "../sim/engine.js";

function randInt(lo, hi) {
  return lo + Math.floor(Math.random() * (hi - lo + 1));
}

function randChoice(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

const NAMES_M = ["Ethan", "James", "Liam", "Noah", "Ben", "Omar", "Raj", "Wei", "Marcus", "Carlos"];
const NAMES_F = ["Sophia", "Maya", "Emma", "Ava", "Priya", "Mei", "Fatima", "Nina", "Zara", "Leah"];
const PROVINCES = ["ON", "BC", "AB", "QC", "MB", "SK", "NS", "NB"];

export function randomProfile() {
  const sex = Math.random() < 0.5 ? "male" : "female";
  const name = randChoice(sex === "male" ? NAMES_M : NAMES_F);
  const age = randInt(18, 35);
  const income = randInt(20000, 120000);
  const tfsaSaved = Math.random() < 0.5 ? 0 : randInt(0, 30000);
  const rrspSaved = Math.random() < 0.5 ? 0 : randInt(0, 20000);
  const otherSaved = Math.random() < 0.3 ? randInt(0, 10000) : 0;
  const savingPerMonth = randChoice([0, 0, 50, 100, 100, 200, 300, 500, 800]);
  const retirementAge = randChoice([60, 65, 65, 65, 67, 70]);
  const exercise = randInt(0, 7);
  const sleep = randChoice([5, 5.5, 6, 6.5, 7, 7, 7.5, 7.5, 8, 8, 9]);
  const smoker = Math.random() < 0.15;
  const drinks = randChoice([0, 0, 1, 2, 3, 5, 7, 10, 14]);

  return {
    name, age, sex, province: randChoice(PROVINCES),
    income_per_year: income,
    savings: { tfsa: tfsaSaved, rrsp: rrspSaved, other: otherSaved },
    saving_per_month: savingPerMonth,
    retirement_age: retirementAge,
    habits: {
      exercise_per_week: exercise,
      sleep_hours: sleep,
      smoker,
      drinks_per_week: drinks,
    },
  };
}

export function profileWithFacts() {
  const profile = randomProfile();
  const facts = simulate(profile, { numLives: 2000 });
  return { profile, facts };
}
