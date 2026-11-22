// Answering real money questions (plan: two Gemini calls, our code does the maths).
//   1. understand: Gemini function calling picks ONE tool and its arguments (no numbers invented here;
//      it only copies numbers the person said, like "$1 million" or "at 70").
//   2. compute:   the tool runs on the seeded simulation (sim/scenarios.js) and returns values + a chart.
//   3. write:     Gemini writes the reply SEEING the values (so the tone fits) but still only through
//                 placeholders; the values live under answer.* and our fill-and-check puts them in.
// The chart is ready after step 2, so the headset shows it while step 3 and the voice are still running.
import { project, solveGoal, position, registeredRoom } from "../sim/scenarios.js";
import { simulate } from "../sim/engine.js";
import { chartForReply } from "./charts.js";

const API = "https://generativelanguage.googleapis.com/v1beta/models";
const DEFAULT_MODEL = "gemini-3.5-flash-lite";
export const askEnabled = () => process.env.ASK_TOOLS !== "0" && Boolean(process.env.GEMINI_API_KEY);

// ---- the tools Gemini may call (function declarations) -------------------------------------
const CHANGES = {
  type: "OBJECT",
  description: "What-if changes to the person's current plan. Leave out anything they did not mention.",
  properties: {
    monthly_set: { type: "NUMBER", description: "Save exactly this many dollars a month." },
    monthly_add: { type: "NUMBER", description: "Save this many dollars more a month (negative for less)." },
    monthly_multiply: { type: "NUMBER", description: "Multiply the current monthly saving, e.g. 2 for 'double', 0.5 for 'half'." },
    lump_now: { type: "NUMBER", description: "A one-time amount in dollars added today." },
    retire_age: { type: "NUMBER", description: "Retire at this age instead." },
    start_delay_years: { type: "NUMBER", description: "Start saving this many years from now instead of today." },
    pause_years: { type: "NUMBER", description: "Stop saving for this many years (a break), starting now unless pause_from_age is given." },
    pause_from_age: { type: "NUMBER", description: "Age when the break from saving starts." },
    income_change_pct: { type: "NUMBER", description: "Income goes up (or down, negative) by this percent." },
  },
};

export const TOOLS = [
  {
    name: "get_position",
    description: "Where the person stands TODAY: how much they have saved (total or by TFSA/RRSP/other), how much they save a month, what share of income they save, and this year's TFSA or RRSP contribution room.",
    parameters: { type: "OBJECT", properties: { metric: { type: "STRING", enum: ["total", "by_account", "saving_rate", "tfsa_room", "rrsp_room"] } }, required: ["metric"] },
  },
  {
    name: "project",
    description: "How their savings grow in future: at an age, best and worst case, or under a what-if (save more or less, double, a lump sum today, retire earlier or later, start later, take a break, a raise). Use for 'how will my investment grow', 'what if I invest double', 'what if I wait five years'.",
    parameters: { type: "OBJECT", properties: { at_age: { type: "NUMBER", description: "Age to report at, if they said one." }, changes: CHANGES }, required: [] },
  },
  {
    name: "solve_goal",
    description: "Work backwards from a goal: how much a month (or as a one-time amount today) to have a target amount by an age, or at what age they reach a target amount. Use for 'how much do I need to invest to have $1 million at 70', 'when will I have $100k'.",
    parameters: {
      type: "OBJECT",
      properties: {
        unknown: { type: "STRING", enum: ["monthly", "lump_now", "reach_age"] },
        target_amount: { type: "NUMBER", description: "The goal in dollars, e.g. 1000000 for a million." },
        target_age: { type: "NUMBER", description: "The age by which they want it, if they said one." },
        confidence: { type: "STRING", enum: ["median", "likely"], description: "'likely' only if they ask to be fairly sure or safe; otherwise 'median'." },
      },
      required: ["unknown", "target_amount"],
    },
  },
  {
    name: "explain_fact",
    description: "A question about something the future self already knows: savings at 70, retirement income, whether the money lasts, life expectancy, healthy years, or the one change that matters most.",
    parameters: { type: "OBJECT", properties: { topic: { type: "STRING", enum: ["savings_70", "income_retired", "money_lasts", "life_expectancy", "healthy_years", "one_change"] } }, required: ["topic"] },
  },
  {
    name: "health_effect",
    description: "Health and habits: how long or how healthily they live, or what changes if they smoke, quit, exercise, sleep or drink differently.",
    parameters: { type: "OBJECT", properties: { habit: { type: "STRING", enum: ["smoking", "exercise", "sleep", "drinking", "general"] } }, required: ["habit"] },
  },
  {
    name: "explain_concept",
    description: "A general explanation with no personal numbers: what a TFSA, RRSP, ETF, index fund or compound growth is, how contribution room works.",
    parameters: { type: "OBJECT", properties: { topic: { type: "STRING" } }, required: ["topic"] },
  },
  {
    name: "chat",
    description: "Small talk or life questions with no money calculation (family, feelings, memories, greetings).",
    parameters: { type: "OBJECT", properties: {}, required: [] },
  },
  {
    name: "decline",
    description: "Out of scope: which specific stock, fund or crypto to buy, someone else's taxes, legal or medical advice.",
    parameters: { type: "OBJECT", properties: { reason: { type: "STRING" } }, required: [] },
  },
];
const TOOL_NAMES = new Set(TOOLS.map((t) => t.name));

// ---- step 1: understand ---------------------------------------------------------------------
export function understandPrompt(profile, last) {
  const p = profile || {};
  const facts = [
    p.age != null && `age ${p.age}`,
    p.retirement_age != null && `plans to retire at ${p.retirement_age}`,
    p.saving_per_month != null && `saves ${p.saving_per_month} dollars a month`,
  ].filter(Boolean).join(", ");
  return `You route a young person's question to exactly one tool. They are talking to their future self (age 70) about money and health in Canada.
About them: ${facts || "unknown"}.
${last ? `Their previous question used ${last.name} with ${JSON.stringify(last.args)}. If this question is a follow-up ("what about double?", "and at 65?"), reuse those arguments and change only what they changed.\n` : ""}Rules: pick the single best tool. Copy numbers only from what they said (write 1000000 for "a million", 100000 for "100k"). Never guess a number they did not say: leave the field out instead.`;
}

export async function understand(question, { profile, last, history = [], apiKey = process.env.GEMINI_API_KEY, model = process.env.GEMINI_MODEL || DEFAULT_MODEL, fetchFn = fetch, timeoutMs = 2500 } = {}) {
  if (!apiKey) throw new Error("ask is off: set GEMINI_API_KEY");
  const contents = [
    ...history.slice(-4).map((h) => ({ role: h.role === "you" ? "user" : "model", parts: [{ text: h.text }] })),
    { role: "user", parts: [{ text: question }] },
  ];
  const res = await fetchFn(`${API}/${model}:generateContent`, {
    method: "POST",
    signal: AbortSignal.timeout(timeoutMs),
    headers: { "x-goog-api-key": apiKey, "content-type": "application/json" },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: understandPrompt(profile, last) }] },
      contents,
      tools: [{ functionDeclarations: TOOLS }],
      toolConfig: { functionCallingConfig: { mode: "ANY" } },
      generationConfig: { temperature: 0 },
    }),
  });
  if (!res.ok) throw new Error(`Gemini ${res.status}`);
  const body = await res.json();
  const call = (body?.candidates?.[0]?.content?.parts ?? []).find((part) => part.functionCall)?.functionCall;
  if (!call || !TOOL_NAMES.has(call.name)) throw new Error("no tool chosen");
  return { name: call.name, args: call.args ?? {} };
}

// ---- step 2: compute --------------------------------------------------------------------------
// Values are formatted text so they are said exactly as computed (fillPlaceholders passes strings through).
export const money = (v) => {
  if (!Number.isFinite(v)) return null;
  const a = Math.abs(Math.round(v));
  const s = a >= 1e6 ? `$${(a / 1e6).toFixed(a >= 1e7 ? 0 : 1)} million` : `$${a.toLocaleString("en-CA")}`;
  return v < 0 ? `minus ${s}` : s;
};
export const pct = (p) => (Number.isFinite(p) ? `${Math.round(p * 100)}%` : null);
const n = (v) => (Number.isFinite(Number(v)) ? Number(v) : undefined);

export function changesFromArgs(c = {}) {
  const ch = {};
  if (n(c.monthly_set) !== undefined) ch.monthly = { set: n(c.monthly_set) };
  else if (n(c.monthly_multiply) !== undefined) ch.monthly = { multiply: n(c.monthly_multiply) };
  else if (n(c.monthly_add) !== undefined) ch.monthly = { add: n(c.monthly_add) };
  if (n(c.lump_now) !== undefined) ch.lump_now = n(c.lump_now);
  if (n(c.retire_age) !== undefined) ch.retire_age = n(c.retire_age);
  if (n(c.start_delay_years) !== undefined) ch.start_delay_years = n(c.start_delay_years);
  if (n(c.pause_years) !== undefined) ch.pause = { years: n(c.pause_years), from_age: n(c.pause_from_age) };
  if (n(c.income_change_pct) !== undefined) ch.income_change_pct = n(c.income_change_pct);
  return ch;
}

function lineChart(title, ages, sets, extra = {}) {
  const labels = ages.filter((a) => a <= 90);
  const pick = (path) => labels.map((a) => path.median[path.ages.indexOf(a)]);
  return { kind: "line", title, labels: labels.map(String), datasets: sets.map(([label, path]) => ({ label, data: pick(path) })), ...extra };
}

const NOTE_TAX = "Money saved above this year's TFSA and RRSP room is counted as growing in an ordinary account; tax on that growth isn't modelled.";

// Each tool: (args, ctx) -> { answer, chart, notes } . answer values are text; notes tell the writer what they mean.
export const COMPUTE = {
  get_position(args, { profile }) {
    const pos = position(profile);
    const answer = {
      total: money(pos.total), tfsa: money(pos.tfsa), rrsp: money(pos.rrsp), other: money(pos.other),
      monthly: money(pos.monthly), saving_rate: pct(pos.savingRate),
      tfsa_room: money(pos.room.tfsa), rrsp_room: money(pos.room.rrsp), tfsa_room_used: pct(pos.tfsaRoomUsed),
    };
    const m = args.metric;
    let chart;
    if (m === "tfsa_room" || m === "rrsp_room") {
      const roomKey = m === "tfsa_room" ? "tfsa" : "rrsp";
      chart = { kind: "stat", title: m === "tfsa_room" ? "This year's new TFSA room" : "This year's new RRSP room", value: money(pos.room[roomKey]), range: `You save ${money(pos.yearly)} a year`, note: "New room for this year only; earlier unused room isn't known." };
    } else if (m === "saving_rate") {
      chart = { kind: "stat", title: "Share of income you save", value: pct(pos.savingRate) ?? "unknown", range: `${money(pos.monthly)} a month`, note: "From your interview answers." };
    } else {
      chart = { kind: "snapshot", title: "Saved today", labels: ["TFSA", "RRSP", "Other"], datasets: [{ label: "Balance", data: [pos.tfsa, pos.rrsp, pos.other] }] };
    }
    return { answer, chart, notes: "Today's balances and saving from their own interview answers; room is this year's new room only (earlier unused room isn't known)." };
  },

  project(args, { profile }) {
    const changes = changesFromArgs(args.changes);
    const r = project(profile, changes, { atAge: n(args.at_age) });
    const diff = r.median - r.baseMedian;
    const answer = {
      age: String(r.age),
      savings_at_age: money(r.median), low: money(r.low), high: money(r.high),
      savings_now_plan: money(r.baseMedian),
      difference: money(Math.abs(diff)), more_or_less: diff >= 0 ? "more" : "less",
      monthly: money(r.monthly), monthly_now: money(r.monthlyNow),
    };
    const chart = r.changed
      ? lineChart("With the change", r.base.ages, [["Your plan now", r.base], ["With the change", r.scen]], { retire_age: n(r.scenarioProfile.retirement_age) })
      : lineChart("Your savings over time", r.scen.ages, [["Projected savings", r.scen]], { retire_age: n(profile.retirement_age ?? 65) });
    const over = r.monthly * 12 > registeredRoom(profile).total;
    return { answer, chart, notes: `savings_at_age is the middle outcome at age ${r.age} (half of simulated lives do better); low and high are the 10th and 90th percentiles.${r.changed ? " savings_now_plan is the same age on their current plan; difference is how much more_or_less they end up with because of the change (say it as e.g. '{answer.difference} {answer.more_or_less}')." : ""}${over ? ` ${NOTE_TAX}` : ""}` };
  },

  solve_goal(args, { profile }) {
    const g = solveGoal(profile, { unknown: args.unknown, targetAmount: n(args.target_amount), targetAge: n(args.target_age), confidence: args.confidence === "likely" ? "likely" : "median" });
    const answer = { target: money(g.target), target_age: String(g.age), monthly_now: money(g.monthlyNow) };
    const sure = g.confidence === "likely" ? "in nine out of ten simulated lives" : "in about half of simulated lives";
    let notes;
    if (g.unknown === "reach_age") {
      answer.reach_age = g.reachable ? String(g.reachAge) : "not within the simulated years";
      notes = g.reachable ? `On their current plan they reach the target at age reach_age (${sure}).` : "On their current plan the target is not reached by ninety; say so kindly and suggest saving more.";
    } else {
      answer.needed = g.reachable ? money(g.value) : "more than this simulation can reach";
      answer.chance = pct(g.chance);
      const room = registeredRoom(profile);
      // A monthly amount counts twelve times a year; a one-time amount counts once, against this year's room.
      const yearly = g.unknown === "monthly" ? g.value * 12 : g.value;
      answer.within_room = !g.reachable ? "out of reach" : yearly <= room.total ? "within this year's TFSA and RRSP room" : "more than this year's TFSA and RRSP room";
      notes = `${g.unknown === "monthly" ? "needed is the amount to save every month from now" : "needed is a one-time amount put in today"} to have target by target_age ${sure}; chance is the share of simulated lives that get there with it; monthly_now is what they save today.${yearly > room.total ? ` ${NOTE_TAX}` : ""}`;
    }
    const target = { value: g.target, label: `Goal: ${money(g.target)}` };
    const chart = g.reachable && g.unknown !== "reach_age"
      ? lineChart("Reaching your goal", g.startPath.ages, [["Your plan now", g.startPath], [g.unknown === "monthly" ? `Saving ${answer.needed} a month` : `Adding ${answer.needed} today`, g.path]], { target, focus_age: g.age })
      : lineChart("Your savings over time", g.startPath.ages, [["Projected savings", g.startPath]], { target, focus_age: g.unknown === "reach_age" && g.reachable ? g.reachAge : g.age });
    return { answer, chart, notes };
  },

  explain_fact(args, ctx) {
    const q = { savings_70: "how much will I have saved by seventy", income_retired: "what will I live on each year in retirement", money_lasts: "will my money last", life_expectancy: "how long will I live", healthy_years: "how healthy will I be", one_change: "what should I change" }[args.topic] ?? ctx.question;
    return { answer: {}, chart: chartForReply(q, ctx.profile, ctx.facts, ctx.path), notes: "" };
  },

  // Rerun with the habit changed (same seeded lives) and compare: healthy-until age and the life
  // expectancy RANGE, now vs with the change. Never a single life expectancy age.
  health_effect(args, ctx) {
    const p = ctx.profile;
    if (!p) return { answer: {}, chart: chartForReply(ctx.question, null, ctx.facts, null), notes: "" };
    const h = { exercise_per_week: 2, sleep_hours: 7, smoker: false, drinks_per_week: 3, ...(p.habits || {}) };
    const better = {
      smoking: h.smoker ? { smoker: false } : null,
      exercise: h.exercise_per_week < 7 ? { exercise_per_week: Math.min(7, h.exercise_per_week + 2) } : null,
      sleep: h.sleep_hours < 7 || h.sleep_hours > 9 ? { sleep_hours: 7.5 } : null,
      drinking: h.drinks_per_week > 0 ? { drinks_per_week: 0 } : null,
    }[args.habit];
    const now = ctx.facts;
    if (!better) {
      return {
        answer: { healthy_now: String(now.healthy_years.median) },
        chart: chartForReply("how healthy will I be", p, now, ctx.path),
        notes: `healthy_now is about the age they stay in good health. ${args.habit && args.habit !== "general" ? "This habit is already at a healthy level for them, so there's nothing to improve here; say so warmly." : ""}`,
      };
    }
    const withIt = simulate({ ...p, habits: { ...h, ...better } });
    const label = { smoking: "quitting smoking", exercise: "exercising twice more a week", sleep: "sleeping seven to eight hours", drinking: "not drinking" }[args.habit];
    const answer = {
      change: label,
      healthy_now: String(now.healthy_years.median), healthy_with: String(withIt.healthy_years.median),
      life_low_now: String(now.life_expectancy.low), life_high_now: String(now.life_expectancy.high),
      life_low_with: String(withIt.life_expectancy.low), life_high_with: String(withIt.life_expectancy.high),
    };
    const chart = {
      kind: "range",
      title: `With ${label}`,
      labels: ["With the change", "Now"],
      datasets: [
        { label: "Low (10th %ile)", data: [withIt.life_expectancy.low, now.life_expectancy.low] },
        { label: "Median", data: [withIt.life_expectancy.median, now.life_expectancy.median] },
        { label: "High (90th %ile)", data: [withIt.life_expectancy.high, now.life_expectancy.high] },
      ],
    };
    return { answer, chart, notes: "healthy_now / healthy_with: about the age they stay in good health, now vs with the change. life_low/high: the range of how long people with these habits live (a population estimate, always said as a range, never one age)." };
  },

  explain_concept() {
    return { answer: {}, chart: null, notes: "Explain the idea simply, in your own words, with no numbers at all (no limits, rates or amounts)." };
  },
  chat() {
    return { answer: {}, chart: null, notes: "" };
  },
  decline() {
    return { answer: {}, chart: null, notes: "Kindly say you can't pick specific investments or give legal, tax-filing or medical advice; offer what you can show instead (their savings, what-ifs, goals)." };
  },
};

// Tools that need the person's own numbers.
const NEEDS_PROFILE = new Set(["get_position", "project", "solve_goal"]);

export function compute(tool, ctx) {
  if (NEEDS_PROFILE.has(tool.name) && !ctx.profile) return { answer: {}, chart: null, notes: "We don't have their own numbers (no interview saved); answer generally without amounts and suggest doing the interview." };
  return COMPUTE[tool.name](tool.args ?? {}, ctx);
}

// Tools that must say no numbers at all: the writer gets no placeholders, so any number is rejected.
const NO_NUMBERS = new Set(["explain_concept", "chat", "decline"]);

// What each facts-sheet placeholder means, so the writer can't read a number backwards
// (the eval caught "a 76% chance it runs out" for a 76% chance it LASTS).
const FACT_MEANINGS = `WHAT THE OTHER PLACEHOLDERS MEAN:
- savings_70.*: savings at age seventy (median = middle outcome; low/high = 10th/90th percentile).
- income_retired_per_year.*: yearly income in retirement, before tax.
- money_lasts_to_90_chance: the chance the money LASTS to ninety (high is good).
- life_expectancy.low / .high: the range of how long people with these habits live. Always say it as a range ("between {life_expectancy.low} and {life_expectancy.high}"), never one age.
- healthy_years.*: about the age they stay in good health (an age, not years from now).
- one_change.label: the single change that helps most.`;

// The facts sheet the writer may use for this tool, with its answer.* values. Life expectancy's
// middle value is removed so it can't be said as a single death age (PLAN.md ethics); the checker
// then rejects it like any unknown placeholder.
export function replyFactsFor(tool, facts, answer) {
  if (NO_NUMBERS.has(tool.name)) return {};
  const { median, ...range } = facts?.life_expectancy ?? {};
  return { ...facts, ...(facts?.life_expectancy ? { life_expectancy: range } : {}), answer };
}

// What the writer is told: each answer.* value with its meaning, so the tone can fit the numbers.
export function writerBrief(tool, result) {
  if (NO_NUMBERS.has(tool.name)) return `\n\nTHIS ANSWER HAS NO NUMBERS AT ALL: no amounts, ages, rates or placeholders. ${result.notes}`;
  const vals = Object.entries(result.answer).filter(([, v]) => v != null);
  const lines = vals.map(([k, v]) => `{answer.${k}} = ${v}`);
  const calc = vals.length ? `\n\nOUR CALCULATOR ANSWERED THIS QUESTION (${tool.name}). Use these placeholders for the numbers, written exactly with braces; the values are shown only so your tone fits them:\n${lines.join("\n")}\n${result.notes}\nAnswer their actual question first, using the most relevant one or two placeholders.` : result.notes ? `\n\n${result.notes}` : "";
  return `${calc}\n\n${FACT_MEANINGS}`;
}

// If the writer's reply fails the checker twice: a plain sentence built from the tool's own result
// (values come from compute, never from the model). Null for tools with nothing specific to say.
export function templateFor(tool, result) {
  const a = result.answer || {};
  if (!Object.keys(a).length) return null;
  switch (tool.name) {
    case "solve_goal":
      if (a.reach_age) return [`On your plan right now, you'd reach ${a.target} around ${a.reach_age}.`];
      if (a.needed && a.within_room !== "out of reach") {
        const how = tool.args?.unknown === "lump_now" ? "put in about " + a.needed + " today" : "put away about " + a.needed + " a month, starting now";
        return [`To have ${a.target} by ${a.target_age}, you'd ${how}.`];
      }
      return [`Honestly, ${a.target} by ${a.target_age} is out of reach on any plan I can work out, but every bit you save still adds up.`];
    case "project":
      if (a.savings_now_plan && a.difference && a.savings_at_age !== a.savings_now_plan) return [`With that change, you'd have about ${a.savings_at_age} by ${a.age}, ${a.difference} ${a.more_or_less} than on your plan now.`];
      return [`By ${a.age}, you'd have about ${a.savings_at_age}, likely somewhere between ${a.low} and ${a.high}.`];
    case "get_position":
      if (tool.args?.metric === "tfsa_room") return [`This year you get ${a.tfsa_room} of new TFSA room.`];
      if (tool.args?.metric === "rrsp_room") return [`This year you get ${a.rrsp_room} of new RRSP room.`];
      if (tool.args?.metric === "saving_rate" && a.saving_rate) return [`You're putting away about ${a.saving_rate} of what you earn.`];
      return [`Right now you've got ${a.total} saved.`];
    default:
      return null;
  }
}
