// What-if and goal maths for the question tools (server/ask.js). Everything runs on the seeded
// simulation (sim/engine.js), so a baseline and a scenario share the same simulated lives and the
// difference between them is the change alone. Nothing here invents a number: each value is a
// simulation percentile, an interview answer, or a Canada.ca limit read at startup.
import { simulatePath } from "./engine.js";
import { TFSA_ANNUAL_LIMIT, RRSP_RATE, RRSP_ANNUAL_MAX } from "./data.js";

const SEARCH_LIVES = 2000; // while searching
const FINAL_LIVES = 5000; // for the reported answer

const num = (v, d = null) => (Number.isFinite(Number(v)) ? Number(v) : d);
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

// Apply what-if changes to an interview profile. changes: { monthly: {set|add|multiply},
// lump_now, retire_age, start_delay_years, pause: {from_age, years}, income_change_pct }.
export function applyChanges(profile, changes = {}) {
  const p = { ...profile, savings: { ...(profile.savings || {}) }, habits: { ...(profile.habits || {}) } };
  const m = changes.monthly || {};
  const now = num(profile.saving_per_month, 0);
  if (num(m.set) !== null) p.saving_per_month = clamp(num(m.set), 0, 50000);
  else if (num(m.multiply) !== null) p.saving_per_month = clamp(now * num(m.multiply), 0, 50000);
  else if (num(m.add) !== null) p.saving_per_month = clamp(now + num(m.add), 0, 50000);
  if (num(changes.lump_now) !== null) p.lump_now = clamp(num(changes.lump_now), 0, 10_000_000);
  if (num(changes.retire_age) !== null) p.retirement_age = clamp(Math.round(num(changes.retire_age)), Math.max(num(profile.age, 20) + 1, 50), 75);
  if (num(changes.start_delay_years) !== null) p.start_delay_years = clamp(num(changes.start_delay_years), 0, 40);
  if (changes.pause && num(changes.pause.years) !== null) p.pause = { from_age: num(changes.pause.from_age, num(profile.age, 20)), years: clamp(num(changes.pause.years), 0, 40) };
  if (num(changes.income_change_pct) !== null) p.income_change_pct = clamp(num(changes.income_change_pct), -90, 300);
  return p;
}

export function hasChanges(changes = {}) {
  return Object.keys(changes).some((k) => changes[k] != null && !(typeof changes[k] === "object" && !Object.keys(changes[k]).length));
}

const valueAt = (path, age, key = "median") => {
  const i = path.ages.indexOf(age);
  return i >= 0 ? path[key][i] : null;
};

// The age to report at: what they asked, else their retirement age, kept inside the simulated range.
export function reportAge(profile, atAge, path) {
  const want = num(atAge, num(profile.retirement_age, 65));
  const ages = path.ages;
  return clamp(Math.round(want), ages[0], ages[ages.length - 1]);
}

// Project the plan as it is, or with changes. Returns both paths and the numbers at one age.
export function project(profile, changes = {}, { atAge } = {}) {
  const base = simulatePath(profile, { numLives: FINAL_LIVES });
  const changed = hasChanges(changes);
  const scenarioProfile = changed ? applyChanges(profile, changes) : profile;
  const scen = changed ? simulatePath(scenarioProfile, { numLives: FINAL_LIVES }) : base;
  const age = reportAge(profile, atAge, scen);
  return {
    changed,
    age,
    base,
    scen,
    scenarioProfile,
    median: valueAt(scen, age),
    low: valueAt(scen, age, "low"),
    high: valueAt(scen, age, "high"),
    baseMedian: valueAt(base, age),
    monthly: num(scenarioProfile.saving_per_month, 0),
    monthlyNow: num(profile.saving_per_month, 0),
  };
}

// Search the input value (monthly saving or a one-time amount today) whose outcome at the target
// age reaches the target. confidence "median" = half of simulated lives get there; "likely" = 9 in 10.
// The outcome rises steadily with the input (same seeded lives), so a few interpolation steps land it.
function searchInput(profile, set, targetAmount, targetAge, confidence, max) {
  const key = confidence === "likely" ? "low" : "median";
  const f = (x, lives = SEARCH_LIVES) => valueAt(simulatePath(set(profile, x), { numLives: lives }), targetAge, key) ?? 0;
  let x0 = 0;
  let f0 = f(0);
  if (f0 >= targetAmount) return { value: 0, reachable: true };
  let x1 = Math.max(100, max / 50);
  let f1 = f(x1);
  for (let i = 0; i < 6; i++) {
    if (f1 === f0) break;
    let x2 = x0 + ((targetAmount - f0) * (x1 - x0)) / (f1 - f0);
    if (!(x2 > 0)) x2 = x1 * 2;
    if (x2 > max) {
      if (f(max) < targetAmount) return { value: null, reachable: false };
      x2 = max;
    }
    const f2 = f(x2);
    [x0, f0, x1, f1] = [x1, f1, x2, f2];
    if (Math.abs(f2 - targetAmount) / targetAmount < 0.005) break;
  }
  // Round up to a sensible step and confirm on the full run.
  const step = max > 100000 ? 100 : 10;
  let value = Math.ceil(x1 / step) * step;
  for (let i = 0; i < 3 && f(value, FINAL_LIVES) < targetAmount; i++) value += Math.max(step, Math.ceil((value * 0.01) / step) * step);
  return { value, reachable: true };
}

// Work backwards. unknown: "monthly" | "lump_now" | "reach_age".
export function solveGoal(profile, { unknown = "monthly", targetAmount, targetAge, confidence = "median" } = {}) {
  const target = clamp(num(targetAmount, 0), 1000, 50_000_000);
  const startPath = simulatePath(profile, { numLives: FINAL_LIVES });
  const age = reportAge(profile, targetAge, startPath);
  const key = confidence === "likely" ? "low" : "median";

  if (unknown === "reach_age") {
    const i = startPath[key].findIndex((v) => v >= target);
    return { unknown, target, confidence, reachable: i >= 0, reachAge: i >= 0 ? startPath.ages[i] : null, path: startPath, startPath, age: i >= 0 ? startPath.ages[i] : age };
  }

  const setMonthly = (p, x) => ({ ...p, saving_per_month: x });
  const setLump = (p, x) => ({ ...p, lump_now: x });
  const { value, reachable } = unknown === "lump_now"
    ? searchInput(profile, setLump, target, age, confidence, 10_000_000)
    : searchInput(profile, setMonthly, target, age, confidence, 50_000);
  const solvedProfile = reachable ? (unknown === "lump_now" ? setLump(profile, value) : setMonthly(profile, value)) : profile;
  const path = reachable ? simulatePath(solvedProfile, { numLives: FINAL_LIVES }) : startPath;
  return {
    unknown,
    target,
    age,
    confidence,
    reachable,
    value,
    chance: reachable ? path.chanceAtLeast(age, target) : null,
    path,
    startPath,
    monthlyNow: num(profile.saving_per_month, 0),
  };
}

// This year's new registered room: TFSA limit, and RRSP at 18% of income up to the yearly maximum
// (both read from Canada.ca at startup). Past contributions are not known, so this is new room only.
export function registeredRoom(profile) {
  const income = num(profile.income_per_year, 0);
  const rrsp = Math.min(income * RRSP_RATE, RRSP_ANNUAL_MAX);
  return { tfsa: TFSA_ANNUAL_LIMIT, rrsp: Math.round(rrsp), total: Math.round(TFSA_ANNUAL_LIMIT + rrsp) };
}

// Where they stand today, from the interview answers.
export function position(profile) {
  const s = profile.savings || {};
  const tfsa = num(s.tfsa, 0), rrsp = num(s.rrsp, 0), other = num(s.other, 0);
  const monthly = num(profile.saving_per_month, 0);
  const income = num(profile.income_per_year, 0);
  const room = registeredRoom(profile);
  return {
    total: tfsa + rrsp + other,
    tfsa, rrsp, other,
    monthly,
    yearly: monthly * 12,
    savingRate: income > 0 ? (monthly * 12) / income : null,
    room,
    tfsaRoomUsed: room.tfsa > 0 ? Math.min(1, (monthly * 12) / room.tfsa) : null,
    roomUsed: room.total > 0 ? Math.min(1, (monthly * 12) / room.total) : null,
  };
}
