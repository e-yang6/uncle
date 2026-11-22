import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { applyChanges, project, solveGoal, position, registeredRoom } from "./scenarios.js";
import { simulatePath } from "./engine.js";

const P = { age: 21, income_per_year: 30000, savings: { tfsa: 2000, rrsp: 0, other: 500 }, saving_per_month: 100, retirement_age: 65 };
const at = (path, age) => path.median[path.ages.indexOf(age)];

describe("engine what-if inputs", () => {
  it("money saved above this year's TFSA + RRSP room still counts", () => {
    const room = registeredRoom(P).total / 12; // about $1,033 a month for this person
    const atRoom = at(simulatePath({ ...P, saving_per_month: Math.ceil(room) }, { numLives: 2000 }), 65);
    const above = at(simulatePath({ ...P, saving_per_month: Math.ceil(room) * 2 }, { numLives: 2000 }), 65);
    assert.ok(above > atRoom * 1.5, `${atRoom} -> ${above}`);
  });
  it("a lump sum today, a late start and a break each move the outcome the right way", () => {
    const base = at(simulatePath(P, { numLives: 2000 }), 65);
    assert.ok(at(simulatePath({ ...P, lump_now: 10000 }, { numLives: 2000 }), 65) > base);
    assert.ok(at(simulatePath({ ...P, start_delay_years: 5 }, { numLives: 2000 }), 65) < base);
    assert.ok(at(simulatePath({ ...P, pause: { from_age: 21, years: 3 } }, { numLives: 2000 }), 65) < base);
  });
  it("chanceAtLeast is a share between 0 and 1 that falls as the bar rises", () => {
    const path = simulatePath(P, { numLives: 2000 });
    const low = path.chanceAtLeast(65, 10000);
    const high = path.chanceAtLeast(65, 1e7);
    assert.ok(low >= 0 && low <= 1 && high >= 0 && high <= 1 && low > high);
    assert.equal(path.chanceAtLeast(200, 1), null);
  });
});

describe("applyChanges", () => {
  it("set, add, multiply and limits", () => {
    assert.equal(applyChanges(P, { monthly: { multiply: 2 } }).saving_per_month, 200);
    assert.equal(applyChanges(P, { monthly: { add: 50 } }).saving_per_month, 150);
    assert.equal(applyChanges(P, { monthly: { set: 400 } }).saving_per_month, 400);
    assert.equal(applyChanges(P, { monthly: { set: -5 } }).saving_per_month, 0);
    assert.equal(applyChanges(P, { retire_age: 30 }).retirement_age, 50); // kept to a sensible range
    assert.equal(P.saving_per_month, 100, "the original profile is untouched");
  });
});

describe("project", () => {
  it("'invest double' equals a run at double, on the same lives", () => {
    const r = project(P, { monthly: { multiply: 2 } });
    const direct = at(simulatePath({ ...P, saving_per_month: 200 }), r.age);
    assert.equal(r.median, direct);
    assert.ok(r.median > r.baseMedian);
  });
  it("no change: the plan as it is, at the retirement age, with a range", () => {
    const r = project(P, {});
    assert.equal(r.changed, false);
    assert.equal(r.age, 65);
    assert.ok(r.low <= r.median && r.median <= r.high);
  });
});

describe("solveGoal", () => {
  it("the monthly amount for $1M at 70, fed back in, gives a median within 2% above the target", () => {
    const g = solveGoal(P, { unknown: "monthly", targetAmount: 1e6, targetAge: 70 });
    assert.ok(g.reachable && g.value > P.saving_per_month);
    const back = at(simulatePath({ ...P, saving_per_month: g.value }), 70);
    assert.ok(back >= 1e6 && back < 1.02e6 * 1.03, `${g.value}/month gives ${back}`);
    assert.ok(g.chance > 0.45 && g.chance < 0.6, `chance ${g.chance}`);
  });
  it("'likely' (9 in 10) needs more than the median goal", () => {
    const m = solveGoal(P, { unknown: "monthly", targetAmount: 1e6, targetAge: 70 });
    const l = solveGoal(P, { unknown: "monthly", targetAmount: 1e6, targetAge: 70, confidence: "likely" });
    assert.ok(l.value > m.value);
  });
  it("a one-time amount today", () => {
    const g = solveGoal(P, { unknown: "lump_now", targetAmount: 500000, targetAge: 65 });
    assert.ok(g.reachable && g.value > 0);
    assert.ok(at(simulatePath({ ...P, lump_now: g.value }), 65) >= 500000);
  });
  it("the age a target is reached on the current plan", () => {
    const g = solveGoal(P, { unknown: "reach_age", targetAmount: 100000 });
    assert.ok(g.reachable && g.reachAge > 21 && g.reachAge < 90);
    assert.ok(at(g.path, g.reachAge) >= 100000 && at(g.path, g.reachAge - 1) < 100000);
  });
  it("a goal already met needs nothing more", () => {
    assert.equal(solveGoal({ ...P, savings: { tfsa: 5e6 } }, { unknown: "monthly", targetAmount: 1e6, targetAge: 65 }).value, 0);
  });
});

describe("position", () => {
  it("balances, saving rate and this year's room from the interview and Canada.ca limits", () => {
    const pos = position(P);
    assert.equal(pos.total, 2500);
    assert.equal(pos.yearly, 1200);
    assert.ok(Math.abs(pos.savingRate - 0.04) < 1e-9);
    assert.ok(pos.room.tfsa > 0 && pos.room.rrsp === Math.round(Math.min(30000 * 0.18, pos.room.rrsp)));
    assert.ok(pos.tfsaRoomUsed > 0 && pos.tfsaRoomUsed < 1);
  });
});
