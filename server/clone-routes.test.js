import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, existsSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { createApp } from "./index.js";
import { createStore, slug } from "../voice/store.js";
import { createClone, extensionFor } from "../voice/clone.js";

async function withApp(clones, fn) {
  const server = createApp({ clones }).listen(0, "127.0.0.1");
  await new Promise((resolve, reject) => (server.once("listening", resolve), server.once("error", reject)));
  try {
    await fn(`http://127.0.0.1:${server.address().port}/api/voice`);
  } finally {
    server.close();
  }
}

function tempStore() {
  const dir = mkdtempSync(path.join(tmpdir(), "uncle-test-"));
  return { store: createStore({ dir: path.join(dir, "saved"), recordingsDir: path.join(dir, "rec") }), dir };
}

const audio = Buffer.alloc(30_000, 1);
const post = (base, name, body = audio, type = "audio/webm") =>
  fetch(`${base}/clone?name=${encodeURIComponent(name)}`, { method: "POST", headers: { "content-type": type }, body });

test("recording a voice creates a clone, saves the recording, and never exposes the voice id", async () => {
  const { store, dir } = tempStore();
  const created = [];
  const createFn = async (args) => (created.push(args), { voiceId: "v-1" });
  await withApp({ store, createFn, deleteFn: async () => {} }, async (base) => {
    const res = await post(base, "Maya");
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.name, "Maya");
    assert.ok(!JSON.stringify(body).includes("v-1"), "voice id is not sent to the browser");
    assert.equal(store.find("maya").voiceId, "v-1");
    assert.equal(created[0].audio.length, audio.length);
    assert.equal(readdirSync(path.join(dir, "rec")).length, 1, "recording kept for returning judges");
    const list = await (await fetch(`${base}/clones`)).json();
    assert.deepEqual(list.map((c) => c.name), ["Maya"]);
    assert.ok(!JSON.stringify(list).includes("v-1"));
  });
  rmSync(dir, { recursive: true, force: true });
});

test("too-short recordings and missing names are refused before any API call", async () => {
  const { store, dir } = tempStore();
  let calls = 0;
  await withApp({ store, createFn: async () => (calls++, { voiceId: "x" }) }, async (base) => {
    assert.equal((await post(base, "Maya", Buffer.alloc(100))).status, 400);
    assert.equal((await post(base, "   ")).status, 400);
    assert.equal(calls, 0);
  });
  rmSync(dir, { recursive: true, force: true });
});

test("re-recording replaces the old clone instead of piling up voices; delete removes it", async () => {
  const { store, dir } = tempStore();
  const deleted = [];
  let n = 0;
  const clones = { store, createFn: async () => ({ voiceId: `v-${++n}` }), deleteFn: async ({ voiceId }) => deleted.push(voiceId) };
  await withApp(clones, async (base) => {
    await post(base, "Maya");
    await post(base, "Maya");
    store.saveProfile("Maya", { age: 21 });
    assert.deepEqual(deleted, ["v-1"], "first clone deleted when re-recorded");
    assert.equal(store.find("Maya").voiceId, "v-2");
    assert.equal((await fetch(`${base}/clones/Maya`, { method: "DELETE" })).status, 200);
    assert.deepEqual(deleted, ["v-1", "v-2"]);
    assert.equal(store.find("Maya"), null);
    assert.equal(readdirSync(path.join(dir, "rec")).length, 0, "recordings deleted too");
    assert.equal(store.getProfile("Maya"), null, "saved answers deleted too");
    assert.equal((await fetch(`${base}/clones/Maya`, { method: "DELETE" })).status, 404);
  });
  rmSync(dir, { recursive: true, force: true });
});

test("no ElevenLabs key gives a clear 503, and nothing is saved", async () => {
  const { store, dir } = tempStore();
  const createFn = async () => {
    throw new Error("voice is off: set ELEVENLABS_API_KEY");
  };
  await withApp({ store, createFn }, async (base) => {
    const res = await post(base, "Maya");
    assert.equal(res.status, 503);
    assert.equal(store.find("Maya"), null);
  });
  rmSync(dir, { recursive: true, force: true });
});

test("createClone sends the recording to ElevenLabs correctly (fake network)", async () => {
  let seen;
  const fetchFn = async (url, init) => ((seen = { url, init }), { ok: true, json: async () => ({ voice_id: "abc" }) });
  const out = await createClone({ name: "Maya", audio, mime: "audio/webm;codecs=opus", apiKey: "k", fetchFn });
  assert.equal(out.voiceId, "abc");
  assert.match(seen.url, /\/v1\/voices\/add$/);
  assert.equal(seen.init.headers["xi-api-key"], "k");
  const f = seen.init.body;
  assert.equal(f.get("remove_background_noise"), "true");
  assert.equal(f.get("files").name, "Maya.webm");
  await assert.rejects(createClone({ name: "x", audio, apiKey: "" }), /voice is off/);
});

test("names become safe keys; file types map to extensions", () => {
  assert.equal(slug("Jeffrey W."), "jeffrey-w");
  assert.equal(slug("../../etc/passwd"), "etc-passwd");
  assert.equal(extensionFor("audio/mp4"), "m4a");
  assert.equal(extensionFor("audio/webm;codecs=opus"), "webm");
});
