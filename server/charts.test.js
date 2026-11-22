import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { chartForReply } from "./charts.js";
import { simulate } from "../sim/engine.js";

const profile = { age: 25, sex: "male", income_per_year: 50000, savings: { tfsa: 5000, rrsp: 0, other: 0 }, saving_per_month: 200, retirement_age: 65, habits: { exercise_per_week: 3, sleep_hours: 7, smoker: false, drinks_per_week: 2 } };
const facts = simulate(profile);

describe("chartForReply", () => {
  it("returns a line chart for savings questions", () => {
    const chart = chartForReply("How much did I save?", profile, facts);
    assert.equal(chart.kind, "line");
    assert.ok(chart.labels.length > 0);
    assert.ok(chart.datasets[0].data.length > 0);
  });

  it("returns a range chart for health questions", () => {
    const chart = chartForReply("How long did I live?", profile, facts);
    assert.equal(chart.kind, "range");
    assert.equal(chart.datasets.length, 3);
  });

  it("returns a before/after chart for change questions (bar for saving, range for a habit)", () => {
    const chart = chartForReply("What should I change?", profile, facts);
    if (facts.one_change.slider === "saving_per_month") {
      assert.equal(chart.kind, "bar");
      assert.equal(chart.datasets.length, 2);
    } else {
      assert.equal(chart.kind, "range");
      assert.equal(chart.datasets.length, 3);
    }
  });

  it("returns null for unrelated questions", () => {
    const chart = chartForReply("Tell me about your dog", profile, facts);
    assert.equal(chart, null);
  });

  it("returns null when facts are missing", () => {
    assert.equal(chartForReply("savings?", profile, null), null);
  });
});

describe("savings line chart growth", () => {
  it("grows with monthly saving (the age labels are numbers, not text, inside the loop)", () => {
    const profile = { age: 24, income_per_year: 55000, savings: { tfsa: 3000, rrsp: 0, other: 500 }, saving_per_month: 300, retirement_age: 65, habits: {} };
    const c = chartForReply("how will my savings grow over time?", profile, simulate(profile));
    assert.equal(c.kind, "line");
    const d = c.datasets[0].data;
    assert.ok(d[1] > d[0] && d[5] > d[1] * 2, "savings climb through the working years: " + d.slice(0, 6));
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
    const chart = chartForReply("How much did I save?", profile, d.facts, d.savingsByAge);
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

describe("savings line shape", () => {
  it("ends at 90 and carries the retirement age", () => {
    const d = simulateDetailed(profile);
    const c = chartForReply("How much will I have saved?", profile, d.facts, d.savingsByAge);
    assert.equal(c.labels.at(-1), "90");
    assert.equal(c.retire_age, 65);
  });
});

describe("what-to-change chart", () => {
  it("a habit suggestion shows life expectancy ranges, not savings bars", () => {
    const f = simulate(profile);
    const habitFacts = { ...f, one_change: { slider: "exercise_per_week", label: "exercising twice more a week" } };
    const c = chartForReply("What should I change?", profile, habitFacts);
    assert.equal(c.kind, "range");
    assert.deepEqual(c.labels, ["With the change", "Now"]);
  });
  it("a saving suggestion still shows savings before and after", () => {
    const f = simulate(profile);
    const c = chartForReply("What should I change?", profile, { ...f, one_change: { slider: "saving_per_month", label: "saving $50 more a month" } });
    assert.equal(c.kind, "bar");
    assert.ok(c.datasets[1].data[0] > c.datasets[0].data[0], "saving more shows more at 70 (seeded, no noise)");
  });
});
