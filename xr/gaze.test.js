import { test } from "node:test";
import assert from "node:assert/strict";
import { clampDir, createGaze } from "./gaze.js";

const deg = (a, b) => (Math.acos(Math.min(1, a[0] * b[0] + a[1] * b[1] + a[2] * b[2])) * 180) / Math.PI;

test("clampDir leaves a direction inside the limit alone (normalised)", () => {
  const d = clampDir([0, 0, 1], [0.1, 0, 1], (28 * Math.PI) / 180);
  assert.ok(Math.abs(deg(d, [0, 0, 1]) - 5.71) < 0.05);
});

test("clampDir pulls a far-off direction back to exactly the limit, on the same side", () => {
  const d = clampDir([0, 0, 1], [1, 0, 0.2], (28 * Math.PI) / 180);
  assert.ok(Math.abs(deg(d, [0, 0, 1]) - 28) < 1e-6);
  assert.ok(d[0] > 0 && Math.abs(d[1]) < 1e-9);
});

test("clampDir looks ahead when the target is straight behind", () => {
  assert.deepEqual(clampDir([0, 0, 1], [0, 0, -1], 0.5), [0, 0, 1]);
});

test("gaze lags behind a moving target, then settles near it", () => {
  const g = createGaze({ random: () => 0.5 }); // 0.5 = no saccade offset
  g([0, 0, 1], 1 / 72);
  const first = g([1, 0, 1], 1 / 72);
  assert.ok(first[0] > 0 && first[0] < 0.1, `moved ${first[0]}, should only start moving`);
  let p;
  for (let i = 0; i < 144; i++) p = g([1, 0, 1], 1 / 72); // 2 s
  assert.ok(Math.abs(p[0] - 1) < 1e-3);
});

test("saccades are small (under 1.5 cm at the target) and change over time", () => {
  let r = 0;
  const seq = [0, 1, 0.2, 0.9, 0.7, 0.1];
  const g = createGaze({ random: () => seq[r++ % seq.length] });
  const seen = new Set();
  for (let i = 0; i < 72 * 10; i++) {
    const p = g([0, 0, 1], 1 / 72);
    assert.ok(Math.abs(p[0]) <= 0.0121 && Math.abs(p[1]) <= 0.0121);
    seen.add(p[0].toFixed(4));
  }
  assert.ok(seen.size > 1);
});
