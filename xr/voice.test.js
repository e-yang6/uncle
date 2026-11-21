import { test } from "node:test";
import assert from "node:assert/strict";
import { isEndMarker } from "./voice.js";

test("the streamed reply's empty final message is an end marker", () => {
  assert.equal(isEndMarker({ type: "reply", sentence: "", audio: null, done: true }), true);
});

test("a spoken sentence is not an end marker", () => {
  assert.equal(isEndMarker({ type: "reply", sentence: "Hello.", audio: "AAAA", done: true }), false);
});

test("a text-only fallback sentence is not an end marker", () => {
  assert.equal(isEndMarker({ type: "reply", sentence: "Hello.", audio: null, done: false }), false);
});
