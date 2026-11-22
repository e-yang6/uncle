import { test } from "node:test";
import assert from "node:assert/strict";
import { statCard, habitCard, compareCard, cardForReply } from "./cards.js";
import { getFacts } from "../sim/facts.js";

const facts = getFacts();
const smoker = { age: 24, sex: "male", habits: { smoker: true, exercise_per_week: 1, sleep_hours: 6, drinks_per_week: 10 } };
// A fake simulation: healthy years go up by 5 whenever the person no longer smokes, drinks less, moves or sleeps more.
const fakeSim = (p) => ({ healthy_years: { median: 60 + (p.habits.smoker ? 0 : 5) + (p.habits.drinks_per_week <= 7 ? 2 : 0) + (p.habits.exercise_per_week > 1 ? 1 : 0) + (p.habits.sleep_hours > 6 ? 1 : 0) }, savings_70: { median: 1000 * (p.saving_per_month ?? 0) } });

test("stat: a 'how much' question gets one big number with its range, formatted like the spoken numbers", () => {
  const c = statCard("how much did I save by seventy?", facts);
  assert.equal(c.kind, "stat");
  assert.match(c.value, /^\$/);
  assert.match(c.range, /^\$.* to \$/);
  assert.ok(c.title && c.note);
  assert.equal(statCard("are you happy?", facts), null, "not a number question");
  assert.match(statCard("how long will my money last, until ninety?", facts).value, /%$/);
  assert.match(statCard("how many healthy years do I get?", facts).value, /years$/);
});

test("habit: only for a habit this person can improve, and only when the simulated gain is real", () => {
  const c = habitCard("what about smoking?", smoker, { simulateFn: fakeSim });
  assert.equal(c.kind, "habit");
  assert.deepEqual(c.datasets[0].data, [60, 65]);
  assert.deepEqual(c.labels, ["Now", "Smoke-free"]);
  assert.equal(habitCard("what about smoking?", { ...smoker, habits: { ...smoker.habits, smoker: false } }, { simulateFn: fakeSim }), null, "non-smoker: no card");
  assert.equal(habitCard("what about smoking?", smoker, { simulateFn: () => ({ healthy_years: { median: 62 } }) }), null, "no gain: no card");
  assert.deepEqual(habitCard("do I need more exercise?", smoker, { simulateFn: fakeSim }).labels, ["1 a week", "3 a week"]);
  assert.equal(habitCard("how are you?", smoker, { simulateFn: fakeSim }), null);
});

test("compare: savings for the money slider, healthy years for the health sliders", () => {
  const a = { ...smoker, saving_per_month: 100 };
  const b = { ...smoker, saving_per_month: 300 };
  const money = compareCard("saving_per_month", a, b, 300, { simulateFn: fakeSim });
  assert.equal(money.kind, "compare");
  assert.equal(money.title, "Saving $300 a month");
  assert.deepEqual(money.datasets[0].data, [100000, 300000]);
  const health = compareCard("smoker", smoker, { ...smoker, habits: { ...smoker.habits, smoker: false } }, false, { simulateFn: fakeSim });
  assert.equal(health.title, "Smoke-free");
  assert.deepEqual(health.datasets[0].data, [60, 65]);
  assert.equal(compareCard("height", a, b, 1), null);
});

test("the new cards are off unless NEW_CARDS=1", () => {
  const old = process.env.NEW_CARDS;
  try {
    delete process.env.NEW_CARDS;
    assert.equal(cardForReply("how much did I save?", smoker, facts), null);
    process.env.NEW_CARDS = "1";
    assert.equal(cardForReply("how much did I save?", smoker, facts).kind, "stat");
  } finally {
    old === undefined ? delete process.env.NEW_CARDS : (process.env.NEW_CARDS = old);
  }
});
