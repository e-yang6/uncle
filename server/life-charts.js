// Four more chart kinds for the headset panels (drawn by xr/charts.js; style page
// /xr/chart-styles.html; reasons and timing in xr/CHARTS.md). Every number is either the
// person's own interview answer or the simulation's facts sheet; nothing is computed here
// beyond adding up their balances.
//
//   snapshot    what they have saved today, by account          interview answers
//   chance      share of simulated lives where money lasts to 90 facts.money_lasts_to_90_chance
//   milestones  retirement and healthy-until, with "In N years"  age, retirement_age, healthy_years.median
//   timeline    their life as year ticks: past, working, retired same
//
// Ethics (PLAN.md): no chart carries life expectancy as a single age; healthy-until is a
// population estimate the facts sheet already gives as a range, shown here as "about".

const num = (v) => (Number.isFinite(Number(v)) ? Number(v) : null);

// Saved today: TFSA / RRSP / other from the interview. Null if we know none of them.
export function snapshotChart(profile) {
  const s = profile?.savings;
  if (!s) return null;
  const vals = [num(s.tfsa), num(s.rrsp), num(s.other)];
  if (vals.every((v) => v === null)) return null;
  return {
    kind: "snapshot",
    title: "Saved today",
    labels: ["TFSA", "RRSP", "Other"],
    datasets: [{ label: "Balance", data: vals.map((v) => Math.max(0, v ?? 0)) }],
  };
}

// Will the money last: the facts sheet's chance (0..1).
export function chanceChart(facts) {
  const p = num(facts?.money_lasts_to_90_chance);
  if (p === null || p < 0 || p > 1) return null;
  return {
    kind: "chance",
    title: "Money lasting",
    labels: ["Money lasts to 90"],
    datasets: [{ label: "of simulated lives that reach 90", data: [p] }],
  };
}

function lifeMarks(profile, facts) {
  const now = num(profile?.age);
  const retire = num(profile?.retirement_age) ?? 65; // the simulation's own default (sim/engine.js)
  const healthy = num(facts?.healthy_years?.median);
  if (now === null || healthy === null) return null;
  return { now, retire, healthy };
}

// Milestones: only the retirement goal gets an "In N years" pill in the headset.
export function milestonesChart(profile, facts) {
  const m = lifeMarks(profile, facts);
  if (!m) return null;
  return {
    kind: "milestones",
    title: "Milestones",
    now: m.now,
    labels: ["Retirement", "Healthy until about"],
    datasets: [{ label: "Age", data: [m.retire, m.healthy] }],
  };
}

// Your life as a timeline: working years, then retired, with healthy-until marked.
export function timelineChart(profile, facts) {
  const m = lifeMarks(profile, facts);
  if (!m) return null;
  return {
    kind: "timeline",
    title: "Your life",
    now: m.now,
    labels: ["Retire", "Healthy to about"],
    datasets: [{ label: "Age", data: [m.retire, m.healthy] }],
  };
}

// Which of these fits a question (checked before the general savings / health charts).
const ASKS_LAST = /\b(last|run out|outlive|enough|make it|afford to retire)\b/i;
const ASKS_TODAY = /\b(right now|today|currently|so far|tfsa|rrsp|have i saved|am i doing)\b/i;
const ASKS_WHEN = /\b(when|what age|how old|how long until|retire at|years until|timeline|my life)\b/i;
const ASKS_PLAN = /\b(goal|goals|milestone|milestones|plan|next step|look forward)\b/i;

// Questions about the present ("how much do I have right now?") must get today's balances, not a
// future figure, so the caller checks this before the future-number cards.
export function todayChartForQuestion(question, profile) {
  return ASKS_TODAY.test(String(question || "")) ? snapshotChart(profile) : null;
}

export function lifeChartForQuestion(question, profile, facts) {
  const q = String(question || "");
  if (ASKS_LAST.test(q)) return chanceChart(facts);
  if (ASKS_TODAY.test(q)) return snapshotChart(profile);
  if (ASKS_PLAN.test(q)) return milestonesChart(profile, facts);
  if (ASKS_WHEN.test(q)) return timelineChart(profile, facts);
  return null;
}
