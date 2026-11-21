import { test } from "node:test";
import assert from "node:assert/strict";
import { wrapLines } from "./wrap.js";

const measure = (t) => t.length; // one unit per character

test("wraps words without exceeding the width", () => {
  const lines = wrapLines("by seventy I had about four hundred thousand put away", 20, measure);
  for (const l of lines) assert.ok(l.length <= 20, l);
  assert.equal(lines.join(" "), "by seventy I had about four hundred thousand put away");
});

test("keeps the newest lines and marks the cut", () => {
  const lines = wrapLines("one two three four five six seven eight nine ten", 9, measure, 2);
  assert.equal(lines.length, 2);
  assert.ok(lines[0].startsWith("…"));
  assert.ok(lines[1].endsWith("ten"));
});

test("empty text gives no lines", () => {
  assert.deepEqual(wrapLines("", 10, measure), []);
  assert.deepEqual(wrapLines(null, 10, measure), []);
});
