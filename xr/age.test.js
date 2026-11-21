import { test } from "node:test";
import assert from "node:assert/strict";
import { ageStrength, faceFrame, toFace, hairZone, jowlZone, cheekZone, medianColor, srgbToLinear, FRAGMENT_MAIN, VERTEX_MAIN } from "./age.js";

test("age strength: nothing when young, full when old, rising in between", () => {
  assert.equal(ageStrength(20), 0);
  assert.equal(ageStrength(25), 0);
  assert.equal(ageStrength(85), 1);
  assert.equal(ageStrength(95), 1);
  assert.ok(ageStrength(65) < ageStrength(70) && ageStrength(70) < ageStrength(75));
  assert.equal(ageStrength("nope"), 0);
});

test("face frame: origin between the eyes, unit is their distance", () => {
  const f = faceFrame([-0.03, 1, 0.1], [0.03, 1, 0.1]);
  assert.deepEqual(f.origin, [0, 1, 0.1]);
  assert.ok(Math.abs(f.unit - 0.06) < 1e-12);
  assert.deepEqual(toFace([0.03, 1.06, 0.1], f).map((v) => +v.toFixed(9)), [0.5, 1, 0]);
});

test("hair zone covers the scalp and back of head, not the face", () => {
  assert.equal(hairZone([0, 1.6, -0.3]), 1); // crown
  assert.equal(hairZone([0, 0.2, -1.6]), 1); // back of the head
  assert.equal(hairZone([0, -0.7, 0.5]), 0); // nose
  assert.equal(hairZone([0.6, -0.6, 0.2]), 0); // cheek
  assert.equal(hairZone([0, 0.4, 0.3]), 0); // forehead
});

test("jowl zone is the lower sides of the face only", () => {
  assert.ok(jowlZone([0.8, -1.5, 0]) > 0.9);
  assert.equal(jowlZone([0, -1.5, 0.3]), 0); // chin centre and lips stay put
  assert.equal(jowlZone([0.8, 0, 0]), 0); // cheekbones
});

test("cheek zone sits on both cheeks", () => {
  assert.ok(cheekZone([0.62, -0.6, 0.2]) && cheekZone([-0.62, -0.6, 0.2]));
  assert.ok(!cheekZone([0, -0.6, 0.6]) && !cheekZone([0.62, -0.6, -0.5]));
});

test("median colour and sRGB decoding", () => {
  assert.deepEqual(medianColor([[0.1, 0.5, 1], [0.3, 0.2, 0], [0.2, 0.9, 0.5]]), [0.2, 0.5, 0.5]);
  assert.equal(medianColor([]), null);
  assert.equal(srgbToLinear(0), 0);
  assert.ok(Math.abs(srgbToLinear(1) - 1) < 1e-12);
  assert.ok(Math.abs(srgbToLinear(0.5) - 0.214) < 0.001);
});

test("shader text never uses GLSL smoothstep with reversed edges", () => {
  for (const src of [FRAGMENT_MAIN, VERTEX_MAIN]) assert.ok(!/\bsmoothstep\(/.test(src));
});
