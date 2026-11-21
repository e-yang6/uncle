import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { createApp } from "./index.js";
import { createStore } from "../voice/store.js";
import { extractFields, normalize, withDefaults } from "../voice/interview.js";

const geminiReply = (obj) => async () => ({ ok: true, json: async () => ({ candidates: [{ content: { parts: [{ text: JSON.stringify(obj) }] } }] }) });

test("normalize keeps good values, nulls the missing, and rejects the absurd", () => {
  const { fields, rejected } = normalize({ age: 21, income_per_year: 30000, tfsa: 2000, sleep_hours: 7, smoker: false, province: "on", sex: null });
  assert.equal(fields.age, 21);
  assert.equal(fields.savings.tfsa, 2000);
  assert.equal(fields.province, "ON");
  assert.equal(fields.habits.smoker, false, "false is a real answer, not 'missing'");
  assert.equal(fields.habits.drinks_per_week, null);
  assert.deepEqual(rejected, []);

  const bad = normalize({ age: 300, sleep_hours: 40, province: "ZZ", sex: "robot", retirement_age: 18, name: "{savings_70.median}" });
  assert.equal(bad.fields.age, null);
  assert.equal(bad.fields.habits.sleep_hours, null);
  assert.equal(bad.fields.province, null);
  assert.equal(bad.fields.sex, null);
  assert.ok(!bad.fields.name.includes("{"), "braces stripped from names");
  assert.ok(bad.rejected.includes("age") && bad.rejected.includes("sleep_hours") && bad.rejected.includes("province"));
});

test("a retirement age at or below the current age is rejected", () => {
  const { fields, rejected } = normalize({ age: 30, retirement_age: 25 });
  assert.equal(fields.retirement_age, null);
  assert.ok(rejected.includes("retirement_age"));
});

test("defaults are applied by our code and every assumed field is listed", () => {
  const { fields } = normalize({ name: "Maya", age: 21 });
  const { profile, assumed } = withDefaults(fields);
  assert.equal(profile.province, "ON");
  assert.equal(profile.retirement_age, 65);
  assert.equal(profile.saving_per_month, 0);
  assert.equal(profile.savings.tfsa, 0);
  assert.equal(profile.income_per_year, null, "income default is 'typical for your age': the simulation supplies it");
  assert.ok(assumed.includes("province") && assumed.includes("sex") && assumed.includes("habits.smoker"));
  assert.ok(!assumed.includes("age") && !assumed.includes("name"));
});

test("extractFields sends audio or text to Gemini and returns the transcript", async () => {
  let sent;
  const fetchFn = async (url, init) => ((sent = { url, body: JSON.parse(init.body), headers: init.headers }), geminiReply({ transcript: "hi I am 21", age: 21 })());
  const a = await extractFields({ audio: Buffer.from("abc"), mime: "audio/webm;codecs=opus", apiKey: "k", fetchFn });
  assert.equal(a.transcript, "hi I am 21");
  assert.equal(a.profile.age, 21);
  assert.equal(sent.headers["x-goog-api-key"], "k");
  assert.equal(sent.body.contents[0].parts[1].inline_data.mime_type, "audio/webm", "codec suffix removed");
  assert.equal(sent.body.generationConfig.responseMimeType, "application/json");
  const t = await extractFields({ transcript: "I am 22", apiKey: "k", fetchFn: geminiReply({ transcript: "x", age: 22 }) });
  assert.equal(t.transcript, "I am 22", "typed transcript is kept as given");
  await assert.rejects(extractFields({ transcript: "x", apiKey: "" }), /is off/);
  await assert.rejects(extractFields({ apiKey: "k" }), /nothing to read/);
  await assert.rejects(extractFields({ transcript: "x", apiKey: "k", fetchFn: async () => ({ ok: true, json: async () => ({ candidates: [{ content: { parts: [{ text: "not json" }] } }] }) }) }), /readable/);
});

async function withApp(interview, fn) {
  const server = createApp({ interview }).listen(0, "127.0.0.1");
  await new Promise((resolve, reject) => (server.once("listening", resolve), server.once("error", reject)));
  try {
    await fn(`http://127.0.0.1:${server.address().port}/api`);
  } finally {
    server.close();
  }
}

test("routes: extract (text and audio), confirm re-checks and saves, profile reads back", async () => {
  const dir = mkdtempSync(path.join(tmpdir(), "uncle-int-"));
  const store = createStore({ dir, recordingsDir: path.join(dir, "rec") });
  const seen = [];
  const extractFn = async (input) => (seen.push(input), { transcript: "t", profile: {}, assumed: [], rejected: [], heard: {} });
  await withApp({ store, extractFn }, async (base) => {
    const t = await fetch(`${base}/interview/extract`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ transcript: "I am 21" }) });
    assert.equal(t.status, 200);
    assert.equal(seen[0].transcript, "I am 21");
    const a = await fetch(`${base}/interview/extract`, { method: "POST", headers: { "content-type": "audio/webm" }, body: Buffer.alloc(30_000, 1) });
    assert.equal(a.status, 200);
    assert.equal(seen[1].audio.length, 30_000);
    assert.equal((await fetch(`${base}/interview/extract`, { method: "POST", headers: { "content-type": "audio/webm" }, body: Buffer.alloc(50) })).status, 400);
    assert.equal((await fetch(`${base}/interview/extract`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ transcript: "  " }) })).status, 400);

    const post = (body) => fetch(`${base}/interview/confirm`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
    const bad = await post({ name: "Maya", profile: { age: 999 } });
    assert.equal(bad.status, 400, "typed-in nonsense is refused");
    assert.equal(store.getProfile("Maya"), null);
    const ok = await post({ name: "Maya", profile: { age: 21, income_per_year: 30000, savings: { tfsa: 2000 }, habits: { smoker: false } } });
    assert.equal(ok.status, 200);
    const got = await (await fetch(`${base}/profile/maya`)).json();
    assert.equal(got.profile.age, 21);
    assert.equal(got.profile.savings.tfsa, 2000);
    assert.equal(got.profile.retirement_age, 65, "defaults filled in");
    assert.equal((await fetch(`${base}/profile/nobody`)).status, 404);
  });
  rmSync(dir, { recursive: true, force: true });
});

test("no Gemini key gives a clear 503", async () => {
  const extractFn = async () => {
    throw new Error("interview reading is off: set GEMINI_API_KEY");
  };
  await withApp({ extractFn, store: createStore({ dir: mkdtempSync(path.join(tmpdir(), "uncle-int-")) }) }, async (base) => {
    const r = await fetch(`${base}/interview/extract`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ transcript: "hi" }) });
    assert.equal(r.status, 503);
    assert.match((await r.json()).error, /is off/);
  });
});
