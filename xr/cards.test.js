import { test } from "node:test";
import assert from "node:assert/strict";
import { isCard, validCard, deltaText, formatAmount, drawCard } from "./cards.js";

function fakeCtx() {
  const texts = [];
  const noop = () => {};
  return {
    texts, clearRect: noop, fillRect: noop, beginPath: noop, moveTo: noop, lineTo: noop, arcTo: noop, arc: noop, closePath: noop, fill: noop, stroke: noop,
    measureText: (t) => ({ width: String(t).length * 10 }),
    fillText: (t) => texts.push(String(t)),
  };
}
const STAT = { kind: "stat", title: "Savings at 70", value: "$29,000", range: "$0 to $246,000", note: "Half of simulated lives end up above the middle value." };
const HABIT = { kind: "habit", title: "A smoke-free path", labels: ["Now", "Smoke-free"], datasets: [{ label: "Years in good health (typical)", data: [62, 72] }], note: "Estimates from a simulation." };
const COMPARE = { kind: "compare", title: "Saving $300 a month", labels: ["Before", "After"], datasets: [{ label: "Savings at 70 (typical)", data: [28791, 241228] }] };

test("only the three new kinds are cards, and anything malformed is refused", () => {
  assert.ok([STAT, HABIT, COMPARE].every((c) => isCard(c) && validCard(c)));
  assert.equal(isCard({ kind: "line" }), false);
  assert.equal(validCard({ kind: "stat", value: "" }), false);
  assert.equal(validCard({ ...HABIT, labels: ["Now"] }), false);
  assert.equal(validCard({ ...HABIT, datasets: [{ label: "x", data: [1, "a"] }] }), false);
  assert.equal(validCard(null), false);
});

test("the change is signed and uses years or dollars as the card says", () => {
  assert.equal(deltaText(HABIT), "+10 years");
  assert.equal(deltaText(COMPARE), "+$212k");
  assert.equal(deltaText({ ...HABIT, datasets: [{ label: "Years", data: [72, 70] }] }), "-2 years");
  assert.equal(formatAmount(HABIT, 62), "62 years");
  assert.equal(formatAmount(COMPARE, 28791), "$29k");
});

test("each card draws its own numbers and small print, and nothing else", () => {
  let c = fakeCtx();
  assert.equal(drawCard(c, STAT, 720, 480), true);
  for (const s of ["$29,000", "$0 to $246,000", "Savings at 70"]) assert.ok(c.texts.includes(s), s);
  c = fakeCtx();
  assert.equal(drawCard(c, HABIT, 720, 480), true);
  for (const s of ["+10 years", "62 years", "72 years", "Now", "Smoke-free"]) assert.ok(c.texts.includes(s), s);
  c = fakeCtx();
  assert.equal(drawCard(c, COMPARE, 720, 480), true);
  for (const s of ["+$212k", "$29k", "$241k", "Before", "After"]) assert.ok(c.texts.includes(s), s);
  assert.equal(drawCard(fakeCtx(), { kind: "stat" }, 720, 480), false);
});
