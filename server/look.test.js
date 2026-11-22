import { test } from "node:test";
import assert from "node:assert/strict";
import { lookTiers, WEALTH_BANDS, HEALTH_BANDS } from "./look.js";
import { profileWithFacts } from "../words/gen-profiles.js";

test("wealth and health tiers follow the cut-offs and are 1 to 4", () => {
  const f = (s, h) => ({ savings_70: { median: s }, healthy_years: { median: h } });
  assert.deepEqual(lookTiers(f(0, 60)), { wealth_tier: 1, health_tier: 1 });
  assert.deepEqual(lookTiers(f(WEALTH_BANDS[0], HEALTH_BANDS[0])), { wealth_tier: 2, health_tier: 2 });
  assert.deepEqual(lookTiers(f(WEALTH_BANDS[1], HEALTH_BANDS[1])), { wealth_tier: 3, health_tier: 3 });
  assert.deepEqual(lookTiers(f(WEALTH_BANDS[2], HEALTH_BANDS[2])), { wealth_tier: 4, health_tier: 4 });
  assert.deepEqual(lookTiers(f(5_000_000, 90)), { wealth_tier: 4, health_tier: 4 });
});

test("missing numbers give null (the headset keeps its middle look), never a guess", () => {
  assert.deepEqual(lookTiers({}), { wealth_tier: null, health_tier: null });
  assert.deepEqual(lookTiers(undefined), { wealth_tier: null, health_tier: null });
  assert.deepEqual(lookTiers({ savings_70: { median: "lots" } }), { wealth_tier: null, health_tier: null });
});

test("real simulated people use all four tiers, so the look actually varies", () => {
  const seenW = new Set(), seenH = new Set();
  for (let i = 0; i < 150; i++) {
    const { facts } = profileWithFacts();
    const t = lookTiers(facts);
    seenW.add(t.wealth_tier);
    seenH.add(t.health_tier);
  }
  assert.deepEqual([...seenW].sort(), [1, 2, 3, 4]);
  assert.deepEqual([...seenH].sort(), [1, 2, 3, 4]);
});
