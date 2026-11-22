import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { chartForReply } from "./charts.js";
import { simulate } from "../sim/engine.js";

const profile = { age: 25, sex: "male", income_per_year: 50000, savings: { tfsa: 5000, rrsp: 0, other: 0 }, saving_per_month: 200, retirement_age: 65, habits: { exercise_per_week: 3, sleep_hours: 7, smoker: false, drinks_per_week: 2 } };
const facts = simulate(profile);

describe("chartForReply", () => {
  it("returns a line chart for savings questions", () => {
    const chart = chartForReply("How will my savings grow over time?", profile, facts);
    assert.equal(chart.kind, "line");
    assert.ok(chart.labels.length > 0);
    assert.ok(chart.datasets[0].data.length > 0);
  });

  it("returns a range chart for health questions", () => {
    const chart = chartForReply("How long did I live?", profile, facts);
    assert.equal(chart.kind, "range");
    assert.equal(chart.datasets.length, 3);
  });

  it("returns a bar chart for change questions", () => {
    const chart = chartForReply("What should I change?", profile, facts);
    assert.equal(chart.kind, "bar");
    assert.equal(chart.datasets.length, 2);
  });

  it("returns null for unrelated questions", () => {
    const chart = chartForReply("Tell me about your dog", profile, facts);
    assert.equal(chart, null);
  });

  it("returns null when facts are missing", () => {
    assert.equal(chartForReply("savings?", profile, null), null);
  });
});

import { chartForSlider, savingsLine } from "./charts.js";
import { simulateDetailed } from "../sim/engine.js";

describe("savings line from the simulation", () => {
  const d = simulateDetailed(profile);
  it("rises while saving and matches the facts sheet at 70", () => {
    const line = savingsLine(d.savingsByAge);
    const data = line.datasets[0].data;
    const at = (age) => data[line.labels.indexOf(String(age))];
    assert.ok(at(35) > at(25) && at(60) > at(35));
    assert.ok(Math.abs(at(70) - d.facts.savings_70.median) / d.facts.savings_70.median < 0.02);
  });
  it("savings questions get the simulated path, not a flat line", () => {
    const chart = chartForReply("How will my savings grow over time?", profile, d.facts, d.savingsByAge);
    const data = chart.datasets[0].data;
    assert.ok(new Set(data).size > data.length / 2, "values change from age to age");
  });
});

describe("chartForSlider", () => {
  const base = simulateDetailed(profile);
  const more = simulateDetailed({ ...profile, saving_per_month: 400 });
  const smoke = simulateDetailed({ ...profile, habits: { ...profile.habits, smoker: true } });
  const b = { facts: base.facts, path: base.savingsByAge };
  it("saving: two lines, where you started first (drawn dashed), now last", () => {
    const c = chartForSlider("saving_per_month", b, { facts: more.facts, path: more.savingsByAge });
    assert.equal(c.kind, "line");
    assert.deepEqual(c.datasets.map((x) => x.label), ["When you started", "Now"]);
    assert.equal(c.datasets[0].data.length, c.labels.length);
  });
  it("saving without paths falls back to a before/after bar", () => {
    const c = chartForSlider("saving_per_month", { facts: base.facts }, { facts: more.facts });
    assert.equal(c.kind, "bar");
    assert.ok(c.datasets[1].data[0] > c.datasets[0].data[0]);
  });
  it("habits: life expectancy as two ranges, never a single age", () => {
    const c = chartForSlider("smoker", b, { facts: smoke.facts, path: smoke.savingsByAge });
    assert.equal(c.kind, "range");
    assert.deepEqual(c.labels, ["Now", "When you started"]);
    assert.equal(c.datasets.length, 3);
  });
  it("same person, no change: identical numbers (no noise)", () => {
    const again = simulateDetailed(profile);
    const c = chartForSlider("saving_per_month", b, { facts: again.facts, path: again.savingsByAge });
    assert.deepEqual(c.datasets[0].data, c.datasets[1].data);
  });
});

describe("a how-much question gets the big-number card, a growth question gets the line", () => {
  it("splits the two by what was asked", () => {
    assert.equal(chartForReply("How much did I save?", profile, facts).kind, "stat");
    assert.equal(chartForReply("How will my savings grow over time?", profile, facts).kind, "line");
  });
});
