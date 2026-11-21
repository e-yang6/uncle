import { test } from "node:test";
import assert from "node:assert/strict";
import { checkSentence, placeholderKeys, writeReply } from "./chat.js";
import { reply } from "../server/brain.js";
import { getFacts } from "../sim/facts.js";

const facts = getFacts();

test("placeholders offered to the model come from the facts sheet, not sources", () => {
  const keys = placeholderKeys(facts);
  assert.ok(keys.includes("savings_70.median") && keys.includes("one_change.label"));
  assert.ok(!keys.some((k) => k.startsWith("sources")));
});

test("checker accepts feelings and known placeholders, rejects invented numbers and unknown placeholders", () => {
  assert.equal(checkSentence("I still walk every morning, it clears my head.", facts), true);
  assert.equal(checkSentence("By then I had {savings_70.median} put away.", facts), true);
  assert.equal(checkSentence("If you do one thing, start now.", facts), true);
  assert.equal(checkSentence("By seventy I felt settled.", facts), true);
  assert.equal(checkSentence("I had 3 grandkids.", facts), false);
  assert.equal(checkSentence("I was sixty when we moved.", facts), false);
  assert.equal(checkSentence("I have three grandkids.", facts), false);
  assert.equal(checkSentence("We retired in 2061.", facts), false);
  assert.equal(checkSentence("I made {salary.top} a year.", facts), false);
  assert.equal(checkSentence("", facts), false);
});

test("reply: a good draft is filled with real numbers and capitalized", async () => {
  const r = await reply("How's money?", facts, { writeFn: async () => ["by seventy I had about {savings_70.median} saved.", "It felt good."] });
  assert.equal(r.source, "gemini");
  assert.match(r.sentences[0], /^By seventy I had about \$420,000 saved\.$/);
});

test("reply: an invented number is rewritten once, and a second failure uses the template answer", async () => {
  let calls = 0;
  const bad = async () => (calls++, ["I had 500000 saved."]);
  const r = await reply("Was I okay with money?", facts, { writeFn: bad });
  assert.equal(calls, 2, "one rewrite");
  assert.equal(r.source, "template");
  assert.ok(r.sentences.length >= 1 && !r.sentences.join(" ").includes("500000"));
  let n = 0;
  const fixed = async () => (n++ === 0 ? ["I had 500000 saved."] : ["Honestly, I felt free."]);
  assert.deepEqual((await reply("hi", facts, { writeFn: fixed })).sentences, ["Honestly, I felt free."]);
});

test("reply: an API failure falls back without throwing", async () => {
  const r = await reply("hello", facts, { writeFn: async () => { throw new Error("Gemini 500"); } });
  assert.equal(r.source, "template");
});

test("writeReply sends the key in a header, the history, and the placeholder list", async () => {
  let seen;
  const fetchFn = async (url, init) => {
    seen = { url, init, body: JSON.parse(init.body) };
    return { ok: true, json: async () => ({ candidates: [{ content: { parts: [{ text: '{"sentences":["Hi there."]}' }] } }] }) };
  };
  const out = await writeReply({ question: "hello", history: [{ role: "you", text: "hi" }, { role: "future", text: "hey" }], facts, name: "Maya", apiKey: "k", fetchFn });
  assert.deepEqual(out, ["Hi there."]);
  assert.equal(seen.init.headers["x-goog-api-key"], "k");
  assert.ok(!seen.url.includes("k="), "key not in the URL");
  assert.deepEqual(seen.body.contents.map((c) => c.role), ["user", "model", "user"]);
  assert.match(seen.body.systemInstruction.parts[0].text, /\{savings_70\.median\}/);
  await assert.rejects(() => writeReply({ question: "x", facts, apiKey: "" }), /is off/);
});
