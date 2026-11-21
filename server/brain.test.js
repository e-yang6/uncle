import { test } from "node:test";
import assert from "node:assert/strict";
import { answer, greeting } from "./brain.js";
import { getFacts } from "../sim/facts.js";

const QUESTIONS = ["house?", "Was I okay with money?", "How's my health?", "What should I change?", "hello"];

test("replies read like speech: no doubled words, every sentence starts with a capital and ends with punctuation", () => {
  const facts = getFacts();
  for (const q of QUESTIONS) {
    for (const s of answer(q, facts)) {
      assert.ok(!/\b(\w+) \1\b/i.test(s), `doubled word in: ${s}`);
      assert.match(s, /^[A-Z"]/, `should start with a capital: ${s}`);
      assert.match(s, /[.!?]$/, `should end with punctuation: ${s}`);
    }
  }
});

test("the money line says 'about' exactly once per amount", () => {
  const money = answer("Was I okay with money?", getFacts()).join(" ");
  assert.match(money, /about \$420,000 put away/);
  assert.match(money, /about \$45,000 a year/);
  assert.ok(!/about about/.test(money));
});

test("a greeting uses the name and a missing name still reads fine", () => {
  assert.match(greeting("Maya")[0], /^Hello Maya,/);
  assert.match(greeting("")[0], /^Hello, it's me/);
});
