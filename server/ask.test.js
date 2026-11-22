import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { TOOLS, understand, compute, writerBrief, templateFor, changesFromArgs, money, replyFactsFor } from "./ask.js";
import { checkSentence } from "../voice/chat.js";
import { fillPlaceholders } from "../sim/facts.js";
import { simulateDetailed } from "../sim/engine.js";

const profile = { age: 21, sex: "male", income_per_year: 30000, savings: { tfsa: 2000, rrsp: 0, other: 500 }, saving_per_month: 100, retirement_age: 65, habits: { exercise_per_week: 2, sleep_hours: 7, smoker: false, drinks_per_week: 3 } };
const d = simulateDetailed(profile);
const ctx = (question) => ({ question, profile, facts: d.facts, path: d.savingsByAge });

const geminiCall = (name, args) => async () => ({ ok: true, json: async () => ({ candidates: [{ content: { parts: [{ functionCall: { name, args } }] } }] }) });

describe("understand (Gemini call 1)", () => {
  it("returns the chosen tool and sends every tool as a function declaration, forcing one call", async () => {
    let sent;
    const fetchFn = async (url, init) => {
      sent = JSON.parse(init.body);
      return geminiCall("solve_goal", { unknown: "monthly", target_amount: 1e6, target_age: 70 })();
    };
    const t = await understand("How much do I need to invest to have a million at 70?", { profile, apiKey: "k", fetchFn });
    assert.deepEqual(t, { name: "solve_goal", args: { unknown: "monthly", target_amount: 1e6, target_age: 70 } });
    assert.equal(sent.tools[0].functionDeclarations.length, TOOLS.length);
    assert.equal(sent.toolConfig.functionCallingConfig.mode, "ANY");
    assert.match(sent.systemInstruction.parts[0].text, /age 21/);
  });

  it("a follow-up sees the previous tool call", async () => {
    let sent;
    const fetchFn = async (url, init) => {
      sent = JSON.parse(init.body);
      return geminiCall("project", {})();
    };
    await understand("and what about double?", { profile, last: { name: "project", args: { at_age: 65 } }, apiKey: "k", fetchFn });
    assert.match(sent.systemInstruction.parts[0].text, /previous question used project/);
  });

  it("fails clearly on no key, an unknown tool, or an HTTP error", async () => {
    await assert.rejects(understand("hi", { apiKey: "" }), /GEMINI_API_KEY/);
    await assert.rejects(understand("hi", { apiKey: "k", fetchFn: geminiCall("buy_stocks", {}) }), /no tool/);
    await assert.rejects(understand("hi", { apiKey: "k", fetchFn: async () => ({ ok: false, status: 500 }) }), /500/);
  });
});

describe("compute (our maths) and the words", () => {
  it("solve_goal: monthly amount for a million at 70, a goal line on the chart, placeholders that pass the checker", () => {
    const tool = { name: "solve_goal", args: { unknown: "monthly", target_amount: 1e6, target_age: 70 } };
    const r = compute(tool, ctx("how much for a million at 70"));
    assert.match(r.answer.needed, /^\$\d/);
    assert.equal(r.answer.target, "$1.0 million");
    assert.equal(r.chart.kind, "line");
    assert.equal(r.chart.target.value, 1e6);
    assert.equal(r.chart.focus_age, 70);
    assert.equal(r.chart.datasets.length, 2);
    const facts = { ...d.facts, answer: r.answer };
    const draft = "To have {answer.target} by {answer.target_age}, you'd put away about {answer.needed} a month.";
    assert.ok(checkSentence(draft, facts));
    const filled = fillPlaceholders(draft, facts);
    assert.ok(filled.ok && filled.text.includes(r.answer.needed) && filled.text.includes("$1.0 million"));
    assert.ok(!checkSentence("You'd put away about $630 a month.", facts), "a raw number is still rejected");
    assert.ok(!checkSentence("About {answer.made_up}.", facts), "an unknown placeholder is still rejected");
  });

  it("project: investing double gives a gain and a two-line chart; no change gives one line with a range", () => {
    const dbl = compute({ name: "project", args: { changes: { monthly_multiply: 2 } } }, ctx("what if I invest double"));
    assert.equal(dbl.chart.datasets.length, 2);
    assert.equal(dbl.answer.monthly, "$200");
    assert.equal(dbl.answer.more_or_less, "more");
    assert.notEqual(dbl.answer.difference, "$0");
    const now = compute({ name: "project", args: {} }, ctx("how will my investment grow"));
    assert.equal(now.chart.datasets.length, 1);
    assert.ok(now.answer.low && now.answer.high);
  });

  it("get_position: today's balances and this year's room", () => {
    assert.equal(compute({ name: "get_position", args: { metric: "total" } }, ctx("how much have I saved")).chart.kind, "snapshot");
    const room = compute({ name: "get_position", args: { metric: "tfsa_room" } }, ctx("how much TFSA room"));
    assert.equal(room.chart.kind, "stat");
    assert.match(room.answer.tfsa_room, /^\$\d/);
  });

  it("money tools without a saved profile give no numbers and no chart", () => {
    const r = compute({ name: "solve_goal", args: { unknown: "monthly", target_amount: 1e6 } }, { question: "x", profile: null, facts: d.facts });
    assert.deepEqual(r.answer, {});
    assert.equal(r.chart, null);
  });

  it("chat, decline and explain_concept compute nothing and show no chart", () => {
    for (const name of ["chat", "decline", "explain_concept"]) assert.equal(compute({ name, args: {} }, ctx("hi")).chart, null);
  });

  it("explain_fact reuses the existing charts", () => {
    assert.ok(compute({ name: "explain_fact", args: { topic: "life_expectancy" } }, ctx("how long will I live")).chart);
  });
});

describe("writer brief and template fallback", () => {
  it("the brief lists each placeholder with its value", () => {
    const tool = { name: "project", args: { changes: { monthly_multiply: 2 } } };
    const brief = writerBrief(tool, compute(tool, ctx("double")));
    assert.match(brief, /\{answer\.savings_at_age\} = \$/);
    assert.match(writerBrief({ name: "chat", args: {} }, compute({ name: "chat", args: {} }, ctx("hi"))), /NO NUMBERS AT ALL/);
    assert.match(brief, /chance the money LASTS/);
  });

  it("templates come only from computed values", () => {
    const tool = { name: "solve_goal", args: { unknown: "monthly", target_amount: 1e6, target_age: 70 } };
    const r = compute(tool, ctx("x"));
    const [line] = templateFor(tool, r);
    assert.ok(line.includes(r.answer.needed) && line.includes(r.answer.target));
    assert.equal(templateFor({ name: "chat", args: {} }, { answer: {} }), null);
  });
});

describe("helpers", () => {
  it("changesFromArgs maps the flat fields Gemini fills to scenario changes", () => {
    assert.deepEqual(changesFromArgs({ monthly_multiply: 2, lump_now: 5000 }), { monthly: { multiply: 2 }, lump_now: 5000 });
    assert.deepEqual(changesFromArgs({ pause_years: 1 }), { pause: { years: 1, from_age: undefined } });
  });

  it("money is said the way people read it", () => {
    assert.equal(money(630), "$630");
    assert.equal(money(1840.4), "$1,840");
    assert.equal(money(1013342), "$1.0 million");
    assert.equal(money(12500000), "$13 million");
  });
});

describe("guards the eval caught", () => {
  it("life expectancy can only be said as a range: its middle value is not a usable placeholder", () => {
    const f = replyFactsFor({ name: "explain_fact", args: {} }, d.facts, {});
    assert.ok(!checkSentence("We make it to about {life_expectancy.median}.", f));
    assert.ok(checkSentence("People like us live between {life_expectancy.low} and {life_expectancy.high}.", f));
  });
  it("concept, chat and decline answers can use no numbers at all", () => {
    for (const name of ["explain_concept", "chat", "decline"]) {
      const f = replyFactsFor({ name, args: {} }, d.facts, {});
      assert.ok(!checkSentence("Your {savings_70.median} grows tax free.", f), name);
    }
  });
  it("a one-time amount is compared with this year's room once, not twelve times a year", () => {
    const r = compute({ name: "solve_goal", args: { unknown: "lump_now", target_amount: 500000, target_age: 65 } }, ctx("x"));
    assert.equal(r.answer.within_room, "more than this year's TFSA and RRSP room");
  });
  it("health_effect compares the habit change on the same lives, as ranges", () => {
    const smoker = { ...profile, habits: { ...profile.habits, smoker: true } };
    const ds = simulateDetailed(smoker);
    const r = compute({ name: "health_effect", args: { habit: "smoking" } }, { question: "what if I quit smoking", profile: smoker, facts: ds.facts, path: ds.savingsByAge });
    assert.equal(r.chart.kind, "range");
    assert.deepEqual(r.chart.labels, ["With the change", "Now"]);
    assert.ok(Number(r.answer.healthy_with) >= Number(r.answer.healthy_now));
    assert.ok(!("life_median_now" in r.answer));
    const already = compute({ name: "health_effect", args: { habit: "smoking" } }, ctx("what if I quit smoking"));
    assert.match(already.notes, /already at a healthy level/);
  });
});
