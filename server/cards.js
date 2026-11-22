// The extra pop-up cards in CONTRACTS.md (kinds stat, habit, compare). Every number comes from the simulation or the
// facts sheet; nothing is typed in here. ON by default now that the headset draws these kinds (xr/cards.js); NEW_CARDS=0 on the server turns them off.
import { simulate } from "../sim/engine.js";
import { fillPlaceholders } from "../sim/facts.js";

export const newCardsOn = () => process.env.NEW_CARDS !== "0";

// Before/after pairs run on this many lives. The simulation draws fresh random numbers each run: measured on one
// profile, the savings median moved about +/-20% between runs at 5,000 lives and +/-12% at 20,000 (healthy years did
// not move at all), so two nearby runs can differ by luck alone. 20,000 lives takes about 150 ms.
const PAIR_LIVES = 20_000; // savings pairs
const HEALTH_LIVES = 10_000; // healthy-years pairs: that median is far steadier, and this halves the wait (about 75 ms a run)
const NOTE = "Estimates from a simulation of many possible lives, not medical or financial advice.";

const fill = (key, facts) => {
  const r = fillPlaceholders(`{${key}}`, facts);
  return r.ok ? r.text : null;
};

// ---- stat: one big number with its range ("how much did I save?") ----
const ASKS_FOR_A_NUMBER = /how much|how many|how long|what.*(number|total|amount)|what do (i|we) have|total|(will|does|do|did).*(last|run out)|chance|odds|likely/i;
const STATS = [
  { when: /last|run out|outlive|ninety|\b90\b/i, key: "money_lasts_to_90_chance", title: "Chance your money lasts to 90", note: "Among simulated people like you who reach 90." },
  { when: /retire.*(income|live|spend)|income.*retire|each year|per year|a year|live on/i, key: "income_retired_per_year", title: "Yearly income in retirement", note: "Before tax. Half of simulated lives land above the middle value." },
  { when: /healthy|health|well|active/i, key: "healthy_years", title: "Years in good health, in total", note: "Over a whole life, for a typical person with your habits.", unit: "years" },
  { when: /sav|money|have|retire|enough|afford|total|much/i, key: "savings_70", title: "Savings at 70", note: "Half of simulated lives end up above the middle value." },
];

export function statCard(question, facts) {
  if (!facts || !ASKS_FOR_A_NUMBER.test(question)) return null;
  const s = STATS.find((x) => x.when.test(question));
  if (!s) return null;
  const unit = s.unit ? ` ${s.unit}` : "";
  const single = facts[s.key];
  const hasRange = single && typeof single === "object";
  const value = fill(hasRange ? `${s.key}.median` : s.key, facts);
  if (value === null) return null;
  const low = hasRange ? fill(`${s.key}.low`, facts) : null;
  const high = hasRange ? fill(`${s.key}.high`, facts) : null;
  return {
    kind: "stat",
    title: s.title,
    value: value + unit,
    range: low && high ? `${low}${unit} to ${high}${unit}` : "",
    note: s.note,
  };
}

// ---- habit: one habit, now versus a gentle improvement ----
const HABITS = [
  {
    when: /smok|vap|cigar|tobacco/i, title: "A smoke-free path", labels: ["Now", "Smoke-free"],
    nudge: (p) => (p.habits?.smoker === true ? { ...p, habits: { ...p.habits, smoker: false } } : null),
  },
  {
    when: /drink|alcohol|beer|wine/i, title: "Fewer drinks", labels: ["Now", "About one a day"],
    nudge: (p) => ((p.habits?.drinks_per_week ?? 0) > 7 ? { ...p, habits: { ...p.habits, drinks_per_week: 7 } } : null),
  },
  {
    when: /exercise|workout|gym|run|active/i, title: "More movement",
    nudge: (p) => (p.habits?.exercise_per_week != null && p.habits.exercise_per_week < 5 ? { ...p, habits: { ...p.habits, exercise_per_week: Math.min(p.habits.exercise_per_week + 2, 7) } } : null),
    labelsFor: (p, n) => [`${p.habits.exercise_per_week} a week`, `${n.habits.exercise_per_week} a week`],
  },
  {
    when: /sleep|tired|rest/i, title: "Better sleep", labels: ["Now", "About 7.5 hours"],
    nudge: (p) => (p.habits?.sleep_hours != null && p.habits.sleep_hours < 7 ? { ...p, habits: { ...p.habits, sleep_hours: 7.5 } } : null),
  },
];

// null when the habit is not one this person can improve, or when the gain is not real: a made-up gain would break the
// rule that Uncle never invents a number.
export function habitCard(question, profile, { simulateFn = simulate } = {}) {
  if (!profile) return null;
  const h = HABITS.find((x) => x.when.test(question));
  if (!h) return null;
  const nudged = h.nudge(profile);
  if (!nudged) return null;
  const before = simulateFn(profile, { numLives: HEALTH_LIVES }).healthy_years.median;
  const after = simulateFn(nudged, { numLives: HEALTH_LIVES }).healthy_years.median;
  if (!(after > before)) return null;
  return {
    kind: "habit",
    title: h.title,
    labels: h.labelsFor ? h.labelsFor(profile, nudged) : h.labels,
    datasets: [{ label: "Years in good health (typical)", data: [before, after] }],
    note: NOTE,
  };
}

// The question-driven card, or null (then the existing line / range / bar charts apply).
export function cardForReply(question, profile, facts, opts) {
  if (!newCardsOn()) return null;
  return habitCard(question, profile, opts) ?? statCard(question, facts);
}

// ---- compare: what one slider move did ----
const SLIDER_TITLE = {
  saving_per_month: (v) => `Saving $${Math.round(v)} a month`,
  exercise_per_week: (v) => `${v} workouts a week`,
  sleep_hours: (v) => `${v} hours of sleep`,
  smoker: (v) => (v ? "Smoking" : "Smoke-free"),
};

// before / after: the session profile before the drag began and now. Savings for the money slider, healthy years
// for the health sliders. Both sides are re-run together at PAIR_LIVES so luck is not shown as an effect.
export function compareCard(slider, beforeProfile, afterProfile, value, { simulateFn = simulate } = {}) {
  if (!SLIDER_TITLE[slider] || !beforeProfile || !afterProfile) return null;
  const money = slider === "saving_per_month";
  const pick = (f) => (money ? f.savings_70.median : f.healthy_years.median);
  const lives = money ? PAIR_LIVES : HEALTH_LIVES;
  const a = pick(simulateFn(beforeProfile, { numLives: lives }));
  const b = pick(simulateFn(afterProfile, { numLives: lives }));
  return {
    kind: "compare",
    title: SLIDER_TITLE[slider](value),
    labels: ["Before", "After"],
    datasets: [{ label: money ? "Savings at 70 (typical)" : "Years in good health (typical)", data: [a, b] }],
    note: NOTE,
  };
}
