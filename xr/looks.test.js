import { test } from "node:test";
import assert from "node:assert/strict";
import { PALETTE, mix, tierOf, lookFor, postureFor, LOOKS, POSTURE, approach } from "./looks-data.js";
import { paintBackdrop, BACKDROP_SIZE } from "./backdrops.js";

test("a tier is 1 to 4; anything else keeps the middle look", () => {
  for (const t of [1, 2, 3, 4]) assert.equal(tierOf(t), t);
  for (const bad of [null, undefined, 0, 5, 2.5, "3", NaN]) assert.equal(tierOf(bad), 2);
  assert.equal(lookFor(null), LOOKS[2]);
  assert.equal(postureFor(undefined), POSTURE[2]);
});

test("colours are tints and shades of the four design colours; the only amber is the top tier's chain", () => {
  assert.equal(mix(PALETTE.ink, PALETTE.paper, 0), PALETTE.ink);
  assert.equal(mix(PALETTE.ink, PALETTE.paper, 1), PALETTE.paper);
  const warm = (h) => { const [r, g, b] = [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16)); return r >= g && g >= b; };
  for (const l of Object.values(LOOKS)) for (const c of [l.body, l.trim, l.shirt].filter(Boolean)) assert.ok(warm(c), `${l.name} ${c} is a warm tone`);
  assert.deepEqual(Object.values(LOOKS).filter((l) => l.chain).map((l) => l.name), ["Affluent"]);
  assert.equal(LOOKS[4].accent, PALETTE.amber);
  assert.ok(Object.values(LOOKS).every((l) => l.body.toLowerCase() !== "#ffffff" && l.body.toLowerCase() !== "#000000"));
});

test("the four looks are different outfits, and healthier tiers stand straighter", () => {
  assert.equal(new Set(Object.values(LOOKS).map((l) => l.outfit)).size, 4);
  const lean = [1, 2, 3, 4].map((t) => POSTURE[t].lean);
  const drop = [1, 2, 3, 4].map((t) => POSTURE[t].drop);
  assert.ok(lean[0] > lean[1] && lean[1] > lean[2] && lean[2] > lean[3], "lean falls as health rises");
  assert.ok(drop[0] > drop[1] && drop[1] > drop[2], "shoulders rise with health");
});

test("blending moves smoothly toward the target and never overshoots", () => {
  let v = 0;
  for (let i = 0; i < 100; i++) { const n = approach(v, 1, 1 / 60, 0.4); assert.ok(n >= v && n <= 1); v = n; }
  assert.equal(v, 1);
  assert.equal(approach(1, 0, 10, 0.4), 0);
});

test("every backdrop paints, covers the picture and draws something for each tier", () => {
  for (const tier of [1, 2, 3, 4, "bad"]) {
    let draws = 0;
    const ctx = new Proxy({}, { get: (_, k) => (k === "createLinearGradient" || k === "createRadialGradient" ? () => ({ addColorStop() {} }) : (...a) => (["fill", "fillRect", "arc"].includes(k) && draws++, undefined)), set: () => true });
    assert.equal(paintBackdrop(ctx, tier), true);
    assert.ok(draws > 10, `tier ${tier}: ${draws} draws`);
  }
  assert.ok(BACKDROP_SIZE.w > 0 && BACKDROP_SIZE.h > 0);
});
