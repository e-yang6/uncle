import { test } from "node:test";
import assert from "node:assert/strict";
import { niceMax, formatValue, formatMoney, formatSigned, formatPercent, validChart, scale, drawChart, monotoneSegments, lineMarkers, phaseOf } from "./charts.js";
import { panelOpacity, FADE_IN, HOLD, FADE_OUT } from "./fade.js";

// Records what would be drawn, without a browser.
function fakeCtx() {
  const texts = [];
  const noop = () => {};
  return {
    texts,
    clearRect: noop, fillRect: noop, beginPath: noop, moveTo: noop, lineTo: noop, arcTo: noop, arc: noop, closePath: noop,
    fill: noop, stroke: noop, bezierCurveTo: noop, setLineDash: noop,
    createLinearGradient: () => ({ addColorStop: noop }),
    measureText: (t) => ({ width: String(t).length * 10 }),
    fillText: (t) => texts.push(String(t)),
  };
}

// Shapes only; the real ones come from the server (xr/sample/make-charts.mjs for real values).
const LINE = { kind: "line", title: "Your savings over time", labels: ["21", "40", "70", "90"], datasets: [{ label: "Projected savings", data: [2000, 90000, 412000, 150000] }] };
const RANGE = { kind: "range", title: "Life expectancy range", labels: ["Life expectancy", "Healthy years"], datasets: [{ label: "Low", data: [78, 66] }, { label: "Median", data: [85, 71] }, { label: "High", data: [93, 77] }] };
const BAR = { kind: "bar", title: "Impact", labels: ["Savings at 70", "Retirement income/yr"], datasets: [{ label: "Current path", data: [300000, 30000] }, { label: "With saving $50 more a month", data: [380000, 34000] }] };
const SNAP = { kind: "snapshot", title: "Saved today", labels: ["TFSA", "RRSP", "Other"], datasets: [{ label: "Balance", data: [2000, 0, 500] }] };
const CHANCE = { kind: "chance", title: "Money lasting", labels: ["Money lasts to 90"], datasets: [{ label: "of simulated lives", data: [0.72] }] };
const MILE = { kind: "milestones", title: "Milestones", now: 21, labels: ["Retirement", "Healthy until about"], datasets: [{ label: "Age", data: [65, 73] }] };
const TIME = { ...MILE, kind: "timeline", title: "Your life" };

test("axis tops are round numbers at or above the data", () => {
  assert.equal(niceMax(412000), 500000);
  assert.equal(niceMax(93), 100);
  assert.equal(niceMax(2100), 2500);
  assert.equal(niceMax(0), 1);
});

test("values are formatted the way people read them", () => {
  assert.equal(formatValue(412000), "$412k");
  assert.equal(formatValue(1250000), "$1.3M");
  assert.equal(formatValue(2500), "$2.5k");
  assert.equal(formatValue(85), "85");
  assert.equal(formatMoney(500), "$500");
  assert.equal(formatMoney(0), "$0");
  assert.equal(formatMoney(-192), "-$192");
  assert.equal(formatSigned(-192), "-$192");
  assert.equal(formatSigned(78000), "+$78k");
  assert.equal(formatSigned(806), "+$806");
  assert.equal(formatPercent(0.765), "77%");
  assert.equal(formatPercent(1.4), "100%");
});

test("only well-formed chart messages are drawn", () => {
  for (const c of [LINE, RANGE, BAR, SNAP, CHANCE, MILE, TIME]) assert.ok(validChart(c), c.kind);
  assert.ok(!validChart({ ...LINE, kind: "pie" }));
  assert.ok(!validChart({ ...LINE, datasets: [{ data: [1, 2] }] }));
  assert.ok(!validChart({ ...CHANCE, datasets: [{ data: [1.5] }] })); // a chance is 0..1
  assert.ok(!validChart({ ...MILE, now: undefined })); // milestones need today's age
  assert.equal(drawChart(fakeCtx(), { kind: "pie" }, 100, 100), false);
});

test("scale maps 0..top onto the pixel range", () => {
  assert.equal(scale(50, 100, 200, 0), 100);
});

test("the smooth curve passes through every point and never overshoots a rising series", () => {
  const pts = [{ x: 0, y: 100 }, { x: 10, y: 80 }, { x: 20, y: 20 }, { x: 30, y: 18 }];
  const segs = monotoneSegments(pts);
  assert.equal(segs.length, 3);
  segs.forEach((s, i) => assert.deepEqual([s.x, s.y], [pts[i + 1].x, pts[i + 1].y]));
  for (const [i, s] of segs.entries()) {
    const lo = Math.min(pts[i].y, pts[i + 1].y);
    const hi = Math.max(pts[i].y, pts[i + 1].y);
    for (const c of [s.c1y, s.c2y]) assert.ok(c >= lo - 1e-9 && c <= hi + 1e-9, `control ${c} outside ${lo}..${hi}`);
  }
});

test("line charts label the peak and the end only", () => {
  assert.deepEqual(lineMarkers([1, 5, 9, 4]), [2, 3]);
  assert.deepEqual(lineMarkers([1, 5, 9]), [2]);
  // with retire_age, the retirement point is labelled instead of the peak
  assert.deepEqual(lineMarkers([1, 5, 9, 8, 7], ["21", "40", "65", "80", "90"], 65), [2, 4]);
  assert.deepEqual(lineMarkers([1, 5, 9, 12, 7], ["21", "40", "65", "80", "90"], 65), [2, 4]);
  assert.deepEqual(lineMarkers([1, 5, 9], ["21", "40", "65"], 70), [2]); // unknown age: falls back to the peak
});

test("life timeline phases", () => {
  assert.equal(phaseOf(15, 21, 65), "past");
  assert.equal(phaseOf(40, 21, 65), "work");
  assert.equal(phaseOf(65, 21, 65), "retired");
});

test("each chart kind shows the message's own numbers", () => {
  const draw = (c) => {
    const ctx = fakeCtx();
    assert.ok(drawChart(ctx, c, 720, 480), c.kind);
    return ctx.texts;
  };
  const l = draw(LINE);
  assert.ok(l.includes("Your savings over time") && l.includes("$500k") && l.includes("Age 90"));
  assert.ok(!l.includes("left at 90") && !l.includes("at age 70"));
  const lg = draw({ ...LINE, target: { value: 1000000, label: "Goal: $1.0 million" } });
  assert.ok(lg.includes("Goal: $1.0 million"), "goal line label");
  const lf = draw({ ...LINE, labels: ["21", "40", "70", "90"], retire_age: 65, focus_age: 70, target: { value: 400000 } });
  assert.ok(lf.includes("Goal: $400k"), "goal remains labelled without a headline summary");
  const lr = draw({ ...LINE, labels: ["21", "40", "65", "90"], retire_age: 65 });
  assert.ok(lr.includes("Your savings over time") && !lr.includes("at retirement, age 65"));
  const b = draw(BAR);
  for (const v of ["$300k", "$380k", "$30k", "$34k"]) assert.ok(b.includes(v), v);
  const s = draw(SNAP);
  for (const v of ["$2.5k", "$2k", "$0", "$500", "80%", "20%"]) assert.ok(s.includes(v), v);
  assert.ok(draw(CHANCE).includes("72%"));
  const m = draw(MILE);
  assert.ok(m.includes("In 44 years") && m.includes("At 73"));
  const t = draw(TIME);
  assert.ok(t.includes("44 working years, then retired") && t.includes("Retirement 65"));
});

test("no chart states a single death age", () => {
  const r = fakeCtx();
  drawChart(r, RANGE, 720, 480);
  assert.ok(r.texts.includes("78") && r.texts.includes("93"));
  assert.ok(r.texts.includes("Middle 80% · age"));
  assert.ok(!r.texts.includes("85") && !r.texts.includes("people with your habits, on average"));
  const m = fakeCtx();
  drawChart(m, MILE, 720, 480);
  assert.equal(m.texts.filter((t) => t.startsWith("In ")).length, 1); // only the goal row gets a countdown-style pill
});

test("panel fades in, stays readable, then fades out", () => {
  assert.equal(panelOpacity(0), 0);
  assert.equal(panelOpacity(FADE_IN), 1);
  assert.equal(panelOpacity(FADE_IN + HOLD - 0.01), 1);
  assert.equal(panelOpacity(FADE_IN + HOLD + FADE_OUT + 1), 0);
  assert.equal(panelOpacity(Infinity), 0);
});
