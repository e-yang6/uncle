import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { snapshotChart, chanceChart, milestonesChart, timelineChart, lifeChartForQuestion } from "./life-charts.js";
import { chartForReply } from "./charts.js";
import { simulate } from "../sim/engine.js";

const profile = { age: 21, income_per_year: 30000, savings: { tfsa: 2000, rrsp: 0, other: 500 }, saving_per_month: 100, retirement_age: 65, habits: { exercise_per_week: 2, sleep_hours: 7, smoker: false, drinks_per_week: 3 } };
const facts = simulate(profile);

describe("life charts", () => {
  it("snapshot: the person's own balances, in account order", () => {
    const c = snapshotChart(profile);
    assert.equal(c.kind, "snapshot");
    assert.deepEqual(c.labels, ["TFSA", "RRSP", "Other"]);
    assert.deepEqual(c.datasets[0].data, [2000, 0, 500]);
  });

  it("snapshot: missing accounts count as 0, no savings answers at all gives no chart", () => {
    assert.deepEqual(snapshotChart({ savings: { tfsa: 1200 } }).datasets[0].data, [1200, 0, 0]);
    assert.equal(snapshotChart({}), null);
    assert.equal(snapshotChart({ savings: {} }), null);
  });

  it("chance: straight from the facts sheet, only when 0..1", () => {
    assert.deepEqual(chanceChart(facts).datasets[0].data, [facts.money_lasts_to_90_chance]);
    assert.equal(chanceChart({ money_lasts_to_90_chance: 1.4 }), null);
    assert.equal(chanceChart({}), null);
  });

  it("milestones and timeline: retirement and healthy-until, never life expectancy", () => {
    for (const c of [milestonesChart(profile, facts), timelineChart(profile, facts)]) {
      assert.equal(c.now, 21);
      assert.deepEqual(c.datasets[0].data, [65, facts.healthy_years.median]);
      assert.ok(!c.datasets[0].data.includes(facts.life_expectancy.median) || facts.life_expectancy.median === facts.healthy_years.median);
      assert.ok(!c.labels.some((l) => /expect|die|death/i.test(l)));
    }
  });

  it("milestones: retirement age defaults to the simulation's 65 when not answered", () => {
    assert.equal(milestonesChart({ age: 30 }, facts).datasets[0].data[0], 65);
    assert.equal(milestonesChart({}, facts), null); // no age, no timeline
  });

  it("questions pick the right chart", () => {
    assert.equal(lifeChartForQuestion("Will my money last?", profile, facts).kind, "chance");
    assert.equal(lifeChartForQuestion("Do I have enough to retire?", profile, facts).kind, "chance");
    assert.equal(lifeChartForQuestion("How much do I have right now?", profile, facts).kind, "snapshot");
    assert.equal(lifeChartForQuestion("What are my goals?", profile, facts).kind, "milestones");
    assert.equal(lifeChartForQuestion("When do I retire?", profile, facts).kind, "timeline");
    assert.equal(lifeChartForQuestion("Tell me about your dog", profile, facts), null);
  });

  it("chartForReply routes to them before the general savings chart", () => {
    assert.equal(chartForReply("Will my savings last?", profile, facts).kind, "chance");
    assert.equal(chartForReply("How much will I have saved?", profile, facts).kind, "line");
  });
});
