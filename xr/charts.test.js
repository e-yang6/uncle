import { test } from "node:test";
import assert from "node:assert/strict";
import { niceMax, formatValue, validChart, scale, drawChart } from "./charts.js";
import { panelOpacity, FADE_IN, HOLD, FADE_OUT } from "./fade.js";

// Records what would be drawn, without a browser.
function fakeCtx() {
  const texts = [];
  const noop = () => {};
  return {
    texts,
    clearRect: noop, fillRect: noop, beginPath: noop, moveTo: noop, lineTo: noop, arcTo: noop, closePath: noop, fill: noop, stroke: noop,
    measureText: (t) => ({ width: String(t).length * 10 }),
    fillText: (t) => texts.push(String(t)),
  };
}

const LINE = { kind: "line", title: "Your savings over time", labels: ["21", "40", "70", "90"], datasets: [{ label: "Projected savings", data: [2000, 90000, 412000, 150000] }] };
const RANGE = { kind: "range", title: "Life expectancy range", labels: ["Life expectancy", "Healthy years"], datasets: [{ label: "Low", data: [78, 66] }, { label: "Median", data: [85, 71] }, { label: "High", data: [93, 77] }] };
const BAR = { kind: "bar", title: "Impact of saving $50 more a month", labels: ["Savings at 70", "Retirement income/yr"], datasets: [{ label: "Current path", data: [300000, 30000] }, { label: "With saving $50 more a month", data: [380000, 34000] }] };

test("axis tops are round numbers at or above the data", () => {
  assert.equal(niceMax(412000), 500000);
  assert.equal(niceMax(93), 100);
  assert.equal(niceMax(2100), 2500);
  assert.equal(niceMax(1000), 1000);
  assert.equal(niceMax(0), 1);
});

test("values are formatted the way people read them", () => {
  assert.equal(formatValue(412000), "$412k");
  assert.equal(formatValue(1250000), "$1.3M");
  assert.equal(formatValue(2500), "$2.5k");
  assert.equal(formatValue(85), "85");
  assert.equal(formatValue(NaN), "");
});

test("only well-formed chart messages are drawn", () => {
  for (const c of [LINE, RANGE, BAR]) assert.ok(validChart(c), c.kind);
  assert.ok(!validChart({ ...LINE, kind: "pie" }));
  assert.ok(!validChart({ ...LINE, datasets: [{ data: [1, 2] }] })); // length mismatch
  assert.ok(!validChart({ ...LINE, datasets: [{ data: [1, 2, "x", 4] }] }));
  assert.ok(!validChart(null));
  assert.equal(drawChart(fakeCtx(), { kind: "pie" }, 100, 100), false);
});

test("scale maps 0..top onto the pixel range", () => {
  assert.equal(scale(0, 100, 200, 0), 200);
  assert.equal(scale(100, 100, 200, 0), 0);
  assert.equal(scale(50, 100, 200, 0), 100);
});

test("each chart kind shows its title and the message's own numbers", () => {
  const l = fakeCtx();
  assert.ok(drawChart(l, LINE, 720, 480));
  assert.ok(l.texts.includes("Your savings over time") && l.texts.includes("$412k") && l.texts.includes("Age 90"));
  const r = fakeCtx();
  drawChart(r, RANGE, 720, 480);
  for (const v of ["78", "85", "93", "66", "71", "77"]) assert.ok(r.texts.includes(v), v);
  const b = fakeCtx();
  drawChart(b, BAR, 720, 480);
  for (const v of ["$300k", "$380k", "$30k", "$34k"]) assert.ok(b.texts.includes(v), v);
});

test("panel fades in, stays readable, then fades out", () => {
  assert.equal(panelOpacity(0), 0);
  assert.equal(panelOpacity(FADE_IN), 1);
  assert.equal(panelOpacity(FADE_IN + HOLD - 0.01), 1);
  assert.ok(panelOpacity(FADE_IN + HOLD + FADE_OUT / 2) > 0 && panelOpacity(FADE_IN + HOLD + FADE_OUT / 2) < 1);
  assert.equal(panelOpacity(FADE_IN + HOLD + FADE_OUT + 1), 0);
  assert.equal(panelOpacity(Infinity), 0);
});
