import { test } from "node:test";
import assert from "node:assert/strict";
import { createApp } from "./index.js";
import { attachVoice } from "./voice-socket.js";
import { answer } from "./brain.js";
import { dropNulls } from "./voice-socket.js";
import { getFacts } from "../sim/facts.js";

async function start(opts) {
  const server = createApp().listen(0, "127.0.0.1");
  await new Promise((resolve, reject) => {
    server.once("listening", resolve);
    server.once("error", reject);
  });
  attachVoice(server, opts);
  return { server, url: `ws://127.0.0.1:${server.address().port}/voice` };
}

// Open a socket, send one message, collect replies until done:true (or an error arrives).
function ask(url, message, { until = (m) => m.type === "reply" && m.done } = {}) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(url);
    const got = [];
    const timer = setTimeout(() => (ws.close(), reject(new Error("timed out"))), 5000);
    ws.onopen = () => ws.send(typeof message === "string" ? message : JSON.stringify(message));
    ws.onmessage = (e) => {
      const m = JSON.parse(e.data);
      got.push(m);
      if (until(m)) (clearTimeout(timer), ws.close(), resolve(got));
    };
    ws.onerror = () => reject(new Error("socket error"));
  });
}

// A fake voice so tests never call ElevenLabs.
const fakeSpeak = async () => {
  const samples = new Float32Array(2400).map((_, n) => 0.3 * Math.sin((2 * Math.PI * 150 * n) / 24000));
  return { samples, sampleRate: 24000, ttfbMs: 1, totalMs: 2 };
};

test("a question gets sentence-by-sentence replies with audio, and done on the last", async () => {
  const { server, url } = await start({ speakFn: fakeSpeak });
  try {
    const got = await ask(url, { type: "text", question: "How's my health?" });
    const replies = got.filter((m) => m.type === "reply");
    assert.ok(replies.length >= 2, "more than one sentence");
    assert.deepEqual(replies.map((r) => r.done), replies.map((_, i) => i === replies.length - 1));
    for (const r of replies) {
      assert.ok(r.sentence.length > 0);
      assert.equal(r.sampleRate, 24000);
      assert.ok(Buffer.from(r.audio, "base64").length > 0, "audio decodes to PCM bytes");
      assert.ok(!/[{}]/.test(r.sentence), "no unfilled placeholder is ever spoken");
    }
  } finally {
    server.close();
  }
});

test("with the voice off, replies still arrive as text with audio null, and one error", async () => {
  const off = async () => {
    throw new Error("voice is off: set ELEVENLABS_API_KEY");
  };
  const { server, url } = await start({ speakFn: off });
  try {
    const got = await ask(url, { type: "text", question: "Did we buy a house?" });
    const replies = got.filter((m) => m.type === "reply");
    assert.ok(replies.length >= 1);
    assert.ok(replies.every((r) => r.audio === null && r.sentence));
    assert.equal(got.filter((m) => m.type === "error" && m.feature === "voice").length, 1);
  } finally {
    server.close();
  }
});

test("bad messages get a clear error; mic audio says it isn't built yet", async () => {
  const { server, url } = await start({ speakFn: fakeSpeak });
  try {
    const isError = (m) => m.type === "error";
    assert.match((await ask(url, "not json", { until: isError })).at(-1).message, /JSON/);
    assert.match((await ask(url, { type: "text", question: "  " }, { until: isError })).at(-1).message, /empty/);
    assert.equal((await ask(url, { type: "audio", data: "AAAA" }, { until: isError })).at(-1).feature, "speech-to-text");
  } finally {
    server.close();
  }
});

test("every canned reply passes Ethan's checker: only numbers from the facts sheet", () => {
  const facts = getFacts();
  for (const q of ["house?", "money", "health", "what should I change", "hello"]) {
    for (const s of answer(q, facts)) {
      assert.ok(!/[{}]/.test(s), `unfilled placeholder in: ${s}`);
      assert.ok(!s.includes("I'd rather not guess"), `a template failed the checker for "${q}"`);
    }
  }
});

// ---- session behaviour: start, clone voice, fallback, age, status ----
const fakeStore = (clones = {}, profiles = {}) => ({
  find: (name) => clones[String(name).toLowerCase()] ?? null,
  getProfile: (name) => profiles[String(name).toLowerCase()] ?? null,
});

// Collect everything until the server goes back to "listening" after replying.
function session(url, messages, repliesWanted = 1) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(url);
    const got = [];
    let finished = 0;
    const timer = setTimeout(() => (ws.close(), reject(new Error("timed out"))), 5000);
    ws.onopen = () => messages.forEach((m) => ws.send(JSON.stringify(m)));
    ws.onmessage = (e) => {
      const m = JSON.parse(e.data);
      got.push(m);
      if (m.type === "reply" && m.done) finished++;
      if (finished >= repliesWanted && m.type === "status" && m.state === "listening") (clearTimeout(timer), ws.close(), resolve(got));
    };
    ws.onerror = () => reject(new Error("socket error"));
  });
}

test("start greets the person by name; status goes thinking, speaking, listening", async () => {
  const { server, url } = await start({ speakFn: fakeSpeak, store: fakeStore() });
  try {
    const got = await session(url, [{ type: "start", name: "Maya", sex: "female", apparent_age: 70 }]);
    const replies = got.filter((m) => m.type === "reply");
    assert.match(replies[0].sentence, /Maya/);
    assert.equal(replies.at(-1).done, true);
    assert.deepEqual(got.filter((m) => m.type === "status").map((m) => m.state), ["listening", "thinking", "speaking", "listening"]);
  } finally {
    server.close();
  }
});

test("a saved clone's voice id is used, and a name with braces can't inject a placeholder", async () => {
  const used = [];
  const speakFn = async (text, opts) => (used.push(opts?.voiceId), fakeSpeak());
  const { server, url } = await start({ speakFn, store: fakeStore({ maya: { voiceId: "clone-123" } }) });
  try {
    await session(url, [{ type: "start", name: "Maya" }]);
    assert.ok(used.length > 0 && used.every((v) => v === "clone-123"));
    const got = await session(url, [{ type: "start", name: "{savings_70.median}" }]);
    assert.ok(!got.find((m) => m.type === "reply").sentence.includes("{"), "braces are stripped from names");
  } finally {
    server.close();
  }
});

test("if the clone fails, it falls back to the stock voice and the conversation continues", async () => {
  const calls = [];
  const speakFn = async (text, opts) => {
    calls.push(opts?.voiceId ?? "stock");
    if (opts?.voiceId === "broken") throw new Error("clone gone");
    return fakeSpeak();
  };
  const { server, url } = await start({ speakFn, store: fakeStore({ maya: { voiceId: "broken" } }) });
  try {
    const got = await session(url, [{ type: "start", name: "Maya" }]);
    assert.ok(got.filter((m) => m.type === "reply").every((m) => m.audio), "audio still plays");
    assert.ok(calls.includes("broken") && calls.includes("stock"));
    assert.equal(got.filter((m) => m.type === "error").length, 0, "no error shown when the fallback worked");
  } finally {
    server.close();
  }
});

test("the age message changes how aged the next sentences are (older = slower = longer audio)", async () => {
  // One second of audio: the filter skips time-stretching on clips under ~0.17 s.
  const oneSecond = async () => ({
    samples: new Float32Array(24000).map((_, n) => 0.3 * Math.sin((2 * Math.PI * 150 * n) / 24000)),
    sampleRate: 24000,
    ttfbMs: 1,
    totalMs: 2,
  });
  const { server, url } = await start({ speakFn: oneSecond, store: fakeStore() });
  try {
    const len = async (age) => {
      const got = await session(url, [{ type: "age", apparent_age: age }, { type: "text", question: "hello" }]);
      return Buffer.from(got.find((m) => m.type === "reply").audio, "base64").length;
    };
    const young = await len(30);
    const old = await len(70);
    assert.ok(old > young * 1.04, `old ${old} vs young ${young}`);
  } finally {
    server.close();
  }
});

test("a confirmed profile runs the simulation on that person's numbers, without nulls", async () => {
  const calls = [];
  const sample = getFacts();
  const getFactsFn = (input) => (calls.push(input), { ...sample, savings_70: { low: 1, median: 777000, high: 3 } });
  const profile = { name: "Maya", age: 21, sex: "female", income_per_year: null, savings: { tfsa: 2000, rrsp: null }, habits: { smoker: false, drinks_per_week: null } };
  const { server, url } = await start({ speakFn: fakeSpeak, getFacts: getFactsFn, store: fakeStore({}, { maya: { profile } }) });
  try {
    const got = await session(url, [{ type: "start", name: "Maya" }, { type: "text", question: "Was I okay with money?" }], 2);
    assert.deepEqual(calls[0], { name: "Maya", age: 21, sex: "female", savings: { tfsa: 2000 }, habits: { smoker: false } }, "nulls removed, false kept");
    assert.ok(got.filter((m) => m.type === "reply").some((m) => /777,000/.test(m.sentence)), "the answer quotes the simulated number");
  } finally {
    server.close();
  }
});

test("dropNulls removes nulls and empty objects but keeps false and 0", () => {
  assert.deepEqual(dropNulls({ a: null, b: 0, c: false, d: { e: null }, f: { g: 1, h: null } }), { b: 0, c: false, f: { g: 1 } });
});
