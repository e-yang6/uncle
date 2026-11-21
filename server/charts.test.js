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
