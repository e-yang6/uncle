// Seeded runs and savings by age (for the headset meters): same input gives the same answer,
// a slider change shows only its own effect, and the path is consistent with the facts sheet.
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { simulate, simulateDetailed, mulberry32 } from "./engine.js";

const P = { age: 21, income_per_year: 30000, savings: { tfsa: 2000, rrsp: 0, other: 500 }, saving_per_month: 100, retirement_age: 65 };

describe("seeded simulation", () => {
  it("gives the same facts for the same input", () => {
    assert.deepEqual(simulate(P), simulate(P));
  });

  it("a different seed gives a different (but similar) answer", () => {
    const a = simulate(P).savings_70.median;
    const b = simulate(P, { seed: 7 }).savings_70.median;
    assert.notEqual(a, b);
    assert.ok(Math.abs(a - b) / a < 0.15, `${a} vs ${b}`);
  });

  it("saving more always shows a gain at 70, for any seed (no noise flips)", () => {
    for (const seed of [1, 2, 3, 4, 5]) {
      const base = simulate(P, { seed, numLives: 2000 }).savings_70.median;
      const more = simulate({ ...P, saving_per_month: 150 }, { seed, numLives: 2000 }).savings_70.median;
      assert.ok(more > base, `seed ${seed}: ${base} -> ${more}`);
    }
  });

  it("the one change is the same every time for the same person", () => {
    assert.equal(simulate(P).one_change.label, simulate(P).one_change.label);
  });

  it("mulberry32 is repeatable and stays in 0..1", () => {
    const r1 = mulberry32(42);
    const r2 = mulberry32(42);
    for (let i = 0; i < 1000; i++) {
      const v = r1();
      assert.equal(v, r2());
      assert.ok(v >= 0 && v < 1);
    }
  });
});

describe("savings by age", () => {
  const { facts, savingsByAge: s } = simulateDetailed(P);

  it("starts at today's age and has ordered percentiles", () => {
    assert.equal(s.ages[0], P.age);
    assert.equal(s.ages.length, s.median.length);
    s.ages.forEach((_, i) => assert.ok(s.low[i] <= s.median[i] && s.median[i] <= s.high[i], `age ${s.ages[i]}`));
  });

  it("grows while saving", () => {
    const at = (a) => s.median[s.ages.indexOf(a)];
    assert.ok(at(30) > at(21) && at(50) > at(30) && at(64) > at(50));
  });

  it("matches the facts sheet at 70", () => {
    const m = s.median[s.ages.indexOf(70)];
    assert.ok(Math.abs(m - facts.savings_70.median) / facts.savings_70.median < 0.02, `${m} vs ${facts.savings_70.median}`);
  });

  it("stays out of the facts sheet (so it never becomes placeholders)", () => {
    assert.equal(facts.savingsByAge, undefined);
    assert.equal(facts.savings_by_age, undefined);
    assert.deepEqual(facts, simulate(P));
  });
});
