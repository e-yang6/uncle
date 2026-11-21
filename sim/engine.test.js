import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { simulate } from "./engine.js";

const SAMPLE_INPUT = {
  name: "Ethan", age: 21, sex: "male", province: "ON",
  income_per_year: 55000,
  savings: { tfsa: 2000, rrsp: 0, other: 500 },
  saving_per_month: 200, retirement_age: 65,
  habits: { exercise_per_week: 3, sleep_hours: 7, smoker: false, drinks_per_week: 2 },
};

describe("simulate", () => {
  it("returns a facts sheet matching the contract schema", () => {
    const facts = simulate(SAMPLE_INPUT, { numLives: 500 });
    assert.ok(facts.savings_70.low <= facts.savings_70.median);
    assert.ok(facts.savings_70.median <= facts.savings_70.high);
    assert.ok(facts.income_retired_per_year.low > 0);
    assert.ok(facts.money_lasts_to_90_chance >= 0 && facts.money_lasts_to_90_chance <= 1);
    assert.ok(facts.life_expectancy.low > 0);
    assert.ok(facts.life_expectancy.median > facts.life_expectancy.low);
    assert.ok(facts.healthy_years.median > 0);
    assert.ok(facts.apparent_age_at_70 > 60 && facts.apparent_age_at_70 < 80);
    assert.ok(facts.one_change);
    assert.ok(facts.one_change.slider);
    assert.ok(facts.one_change.label);
    assert.ok(Array.isArray(facts.sources));
  });

  it("produces reasonable life expectancy for a healthy male", () => {
    const facts = simulate(SAMPLE_INPUT, { numLives: 2000 });
    // StatsCan 2020-2022: male life expectancy ~80
    assert.ok(facts.life_expectancy.median >= 70, `median LE ${facts.life_expectancy.median} too low`);
    assert.ok(facts.life_expectancy.median <= 92, `median LE ${facts.life_expectancy.median} too high`);
  });

  it("produces reasonable life expectancy for a healthy female", () => {
    const facts = simulate({ ...SAMPLE_INPUT, sex: "female" }, { numLives: 2000 });
    // StatsCan 2020-2022: female life expectancy ~84
    assert.ok(facts.life_expectancy.median >= 74, `median LE ${facts.life_expectancy.median} too low`);
    assert.ok(facts.life_expectancy.median <= 96, `median LE ${facts.life_expectancy.median} too high`);
  });

  it("smoking reduces life expectancy", () => {
    const healthy = simulate(SAMPLE_INPUT, { numLives: 2000 });
    const smoker = simulate({
      ...SAMPLE_INPUT,
      habits: { ...SAMPLE_INPUT.habits, smoker: true },
    }, { numLives: 2000 });
    assert.ok(
      smoker.life_expectancy.median < healthy.life_expectancy.median,
      `smoker LE ${smoker.life_expectancy.median} should be less than healthy ${healthy.life_expectancy.median}`
    );
  });

  it("more saving increases savings at 70", () => {
    const low = simulate({ ...SAMPLE_INPUT, saving_per_month: 50 }, { numLives: 2000 });
    const high = simulate({ ...SAMPLE_INPUT, saving_per_month: 500 }, { numLives: 2000 });
    assert.ok(
      high.savings_70.median > low.savings_70.median,
      `$500/mo savings ${high.savings_70.median} should exceed $50/mo ${low.savings_70.median}`
    );
  });

  it("runs 5000 lives in under 100ms", () => {
    const start = performance.now();
    simulate(SAMPLE_INPUT, { numLives: 5000 });
    const elapsed = performance.now() - start;
    assert.ok(elapsed < 100, `took ${elapsed.toFixed(1)}ms, limit is 100ms`);
  });

  it("works with default inputs (no fields provided)", () => {
    const facts = simulate({}, { numLives: 500 });
    assert.ok(facts.savings_70.median >= 0);
    assert.ok(facts.life_expectancy.median > 50);
  });

  it("includes government income in retired income", () => {
    const facts = simulate(SAMPLE_INPUT, { numLives: 500 });
    // CPP + OAS minimum is roughly $10k+/year
    assert.ok(
      facts.income_retired_per_year.low >= 8000,
      `retired income low ${facts.income_retired_per_year.low} should include CPP+OAS`
    );
  });
});
