import { test } from "node:test";
import assert from "node:assert/strict";
import { createApp } from "./index.js";
import { attachVoice } from "./voice-socket.js";
import { answer, greeting } from "./brain.js";
import { dropNulls } from "./voice-socket.js";
import { getFacts } from "../sim/facts.js";

async function start(opts) {
  const server = createApp().listen(0, "127.0.0.1");
  await new Promise((resolve, reject) => {
    server.once("listening", resolve);
    server.once("error", reject);
  });
  attachVoice(server, { writeFn: async () => { throw new Error("no model in tests"); }, ...opts });
  return { server, url: `ws://127.0.0.1:${server.address().port}/voice` };
}

// Open a socket, send one message, collect replies until done:true (or an error arrives).
function ask(url, message, { until = (m) => m.type === "reply" && m.done, timeout = 5000 } = {}) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(url);
    const got = [];
    const timer = setTimeout(() => (ws.close(), reject(new Error("timed out"))), timeout);
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
  const { server, url } = await start({ speakFn: off, samples: new Map() });
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

test("bad messages get a clear error", async () => {
  const { server, url } = await start({ speakFn: fakeSpeak });
  try {
    const isError = (m) => m.type === "error";
    assert.match((await ask(url, "not json", { until: isError })).at(-1).message, /JSON/);
    assert.match((await ask(url, { type: "text", question: "  " }, { until: isError })).at(-1).message, /empty/);
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
    assert.ok(old > young * 1.02, `old ${old} vs young ${young}`);
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

// ---- microphone: speech-to-text, end of speech, echo guard ----
function fakeStt() {
  const made = [];
  const factory = (cbs) => {
    const s = { cbs, chunks: [], closed: false, send(b64, rate) { this.chunks.push([b64, rate]); return true; }, close() { this.closed = true; } };
    made.push(s);
    return s;
  };
  return { factory, made };
}
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
function openSocket(url) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(url);
    const got = [];
    ws.onmessage = (e) => got.push(JSON.parse(e.data));
    ws.onopen = () => resolve({ ws, got });
    ws.onerror = () => reject(new Error("socket error"));
  });
}

test("mic audio is streamed to speech-to-text; a finished sentence becomes a transcript and a spoken answer", async () => {
  const { factory, made } = fakeStt();
  const { server, url } = await start({ speakFn: fakeSpeak, store: fakeStore(), sttFactory: factory });
  try {
    const { ws, got } = await openSocket(url);
    ws.send(JSON.stringify({ type: "audio", data: "AAAA", sampleRate: 16000 }));
    ws.send(JSON.stringify({ type: "audio", data: "BBBB", sampleRate: 16000 }));
    await wait(100);
    assert.equal(made.length, 1, "one speech session, not one per chunk");
    assert.deepEqual(made[0].chunks, [["AAAA", 16000], ["BBBB", 16000]]);
    made[0].cbs.onTranscript("How's my health?");
    await wait(300);
    assert.equal(got.find((m) => m.type === "transcript").text, "How's my health?");
    assert.ok(got.filter((m) => m.type === "reply").length >= 2, "and Uncle answers it");
    ws.close();
    await wait(50);
    assert.equal(made[0].closed, true, "speech session closed with the socket");
  } finally {
    server.close();
  }
});

test("echo guard: mic audio is ignored while the future self is talking", async () => {
  const { factory, made } = fakeStt();
  const oneSecond = async () => ({ samples: new Float32Array(24000).fill(0.1), sampleRate: 24000, ttfbMs: 1, totalMs: 2 });
  const { server, url } = await start({ speakFn: oneSecond, store: fakeStore(), sttFactory: factory });
  try {
    const { ws } = await openSocket(url);
    ws.send(JSON.stringify({ type: "text", question: "hello" })); // reply is several seconds of audio
    await wait(300);
    ws.send(JSON.stringify({ type: "audio", data: "ECHO", sampleRate: 16000 }));
    await wait(100);
    assert.equal(made.length, 0, "no speech session opened for echo");
    ws.close();
  } finally {
    server.close();
  }
});

test("speech-to-text errors and a missing key are reported, and the session can reopen", async () => {
  const { factory, made } = fakeStt();
  const { server, url } = await start({ speakFn: fakeSpeak, store: fakeStore(), sttFactory: factory });
  try {
    const { ws, got } = await openSocket(url);
    ws.send(JSON.stringify({ type: "audio", data: "AAAA" }));
    await wait(80);
    made[0].cbs.onError("quota_exceeded: out of credits");
    await wait(80);
    assert.equal(got.find((m) => m.type === "error").feature, "speech-to-text");
    ws.send(JSON.stringify({ type: "audio", data: "CCCC" }));
    await wait(80);
    assert.equal(made.length, 2, "reopens on the next chunk");
    ws.close();

    const off = () => { throw new Error("speech-to-text is off: set ELEVENLABS_API_KEY"); };
    const b = await start({ speakFn: fakeSpeak, store: fakeStore(), sttFactory: off });
    const s2 = await openSocket(b.url);
    s2.ws.send(JSON.stringify({ type: "audio", data: "AAAA" }));
    await wait(80);
    assert.match(s2.got.find((m) => m.type === "error").message, /is off/);
    s2.ws.close();
    b.server.close();
  } finally {
    server.close();
  }
});

test("a hung clone voice falls back to the stock voice instead of stalling the reply", async () => {
  let calls = 0;
  const hangsOnClone = async (_s, opts) => (calls++, opts.voiceId ? new Promise(() => {}) : fakeSpeak());
  const store = { ...fakeStore(), find: () => ({ voiceId: "clone-1" }) };
  const { server, url } = await start({ speakFn: hangsOnClone, store });
  try {
    const t0 = performance.now();
    const got = await ask(url, { type: "start", name: "Maya", sex: "female", apparent_age: 70 }, { until: (m) => m.type === "reply" && m.done, timeout: 15000 });
    assert.ok(got.some((m) => m.type === "reply" && m.audio), "still got audio, from the stock voice");
    assert.ok(performance.now() - t0 < 12000);
  } finally {
    server.close();
  }
});

test("if the speech service is down, pre-recorded lines still play, and other lines stay text-only", async () => {
  const down = async () => { throw new Error("ElevenLabs 401: out of credits"); };
  const clip = (text) => ({ text, samples: new Float32Array(24000).fill(0.1), sampleRate: 24000 });
  const samples = new Map([
    ["hello, it's me, from a long way down the road.", clip("Hello, it's me, from a long way down the road.")],
    ["i've been looking forward to this. ask me anything.", clip("I've been looking forward to this. Ask me anything.")],
  ]);
  const { server, url } = await start({ speakFn: down, store: fakeStore(), samples });
  try {
    const got = await ask(url, { type: "start", name: "Maya", sex: "female", apparent_age: 70 });
    const replies = got.filter((m) => m.type === "reply");
    assert.equal(replies.length, 2);
    assert.ok(replies.every((r) => r.audio), "both greeting lines are spoken from recordings");
    assert.equal(replies[0].sentence, "Hello, it's me, from a long way down the road.", "the caption matches the recorded words, not the name");
    assert.equal(got.filter((m) => m.type === "error").length, 1, "one notice, not one per sentence");

    const q = await ask(url, { type: "text", question: "Was I okay with money?" });
    const lines = q.filter((m) => m.type === "reply");
    assert.ok(lines.length >= 1 && lines.every((r) => r.audio === null), "no recording for these, so text only");
  } finally {
    server.close();
  }
});

// ---- streaming replies from the fine-tuned model ----
import http from "node:http";
import { resetModelBreaker } from "../voice/chat.js";

// A fake vLLM: sends the reply as server-sent events, with a pause before the last piece.
function fakeModel(pieces, { pauseMs = 300, status = 200 } = {}) {
  const server = http.createServer((req, res) => {
    req.resume();
    if (status !== 200) return res.writeHead(status).end("nope");
    res.writeHead(200, { "content-type": "text/event-stream" });
    const emit = (c) => res.write(`data: ${JSON.stringify({ choices: [{ delta: { content: c } }] })}\n\n`);
    pieces.slice(0, -1).forEach(emit);
    setTimeout(() => (emit(pieces.at(-1)), res.write("data: [DONE]\n\n"), res.end()), pauseMs);
  });
  return new Promise((resolve) => server.listen(0, "127.0.0.1", () => resolve({ server, url: `http://127.0.0.1:${server.address().port}` })));
}

async function withModel(model, fn) {
  const oldFirst = process.env.MODEL_FIRST;
  process.env.MODEL_FIRST = "1";
  const old = process.env.MODEL_URL;
  process.env.MODEL_URL = model.url;
  resetModelBreaker();
  try {
    await fn();
  } finally {
    old === undefined ? delete process.env.MODEL_URL : (process.env.MODEL_URL = old);
    oldFirst === undefined ? delete process.env.MODEL_FIRST : (process.env.MODEL_FIRST = oldFirst);
    resetModelBreaker();
    model.server.close();
  }
}

test("streaming: the first sentence is spoken before the model finishes, bad sentences are skipped, and the reply ends with an empty done", async () => {
  const model = await fakeModel(["Hey, it's me. I had about {savings_70.", "median} put away. I also have 500 dollars. ", "Be kind to us."], { pauseMs: 400 });
  await withModel(model, async () => {
    const { server, url } = await start({ speakFn: fakeSpeak, streamReplies: true });
    try {
      const t0 = Date.now();
      const times = [];
      const got = await ask(url, { type: "text", question: "How is my money?" }, { until: (m) => (m.type === "reply" && times.push(Date.now() - t0), m.type === "reply" && m.done) });
      const replies = got.filter((m) => m.type === "reply");
      const spoken = replies.filter((r) => r.sentence);
      assert.ok(spoken.length >= 2, JSON.stringify(spoken.map((r) => r.sentence)));
      assert.ok(spoken.every((r) => r.audio && !/[{}]|\b500\b/.test(r.sentence)), "filled, spoken, and the made-up number never reaches the user");
      assert.ok(spoken.some((r) => /about \$?[\w ,-]+ put away/.test(r.sentence) && !r.sentence.includes("{")), spoken.map((r) => r.sentence).join(" | "));
      assert.equal(replies.at(-1).done, true);
      assert.equal(replies.at(-1).sentence, "");
      assert.equal(replies.at(-1).audio, null);
      assert.equal(spoken[0].timing.source, "model");
      assert.ok(times[0] < 350, `first sentence came at ${times[0]} ms, before the model finished at ~400 ms`);
    } finally {
      server.close();
    }
  });
});

test("streaming: if the model is down, the normal reply path answers and still ends with done", async () => {
  const model = await fakeModel(["x"], { status: 500 });
  await withModel(model, async () => {
    const { server, url } = await start({ speakFn: fakeSpeak, streamReplies: true });
    try {
      const got = await ask(url, { type: "text", question: "How's my health?" });
      const replies = got.filter((m) => m.type === "reply");
      assert.ok(replies.length >= 2, `expected at least 2 replies, got ${replies.length}`);
      assert.ok(replies.filter((r) => r.sentence && r.audio).length >= 1, "at least one spoken sentence");
      assert.equal(replies.at(-1).done, true);
    } finally {
      server.close();
    }
  });
});

test("read-only mirror receives the Quest replies without another voice or microphone session", async()=>{
  const {createMirrorSession}=await import('./mirror-sessions.js');
  const grant=createMirrorSession('https://uncle.test/xr/?name=Mirror');
  const producerToken=new URL(grant.url,'https://uncle.test').searchParams.get('mirror');
  let speechCalls=0,sttCalls=0;
  const {server,url}=await start({speakFn:async()=>{speechCalls++;return fakeSpeak();},sttFactory:()=>{sttCalls++;return {send(){},close(){}};}});
  const watcher=new WebSocket(url),source=new WebSocket(url);
  const open=ws=>new Promise(resolve=>{if(ws.readyState===1)resolve();else ws.onopen=resolve;});
  const next=(ws,predicate)=>new Promise((resolve,reject)=>{
    const timer=setTimeout(()=>reject(new Error('mirror timeout')),3000);
    const listener=e=>{const msg=JSON.parse(e.data);if(predicate(msg)){clearTimeout(timer);ws.removeEventListener('message',listener);resolve(msg);}};
    ws.addEventListener('message',listener);
  });
  try {
    await Promise.all([open(watcher),open(source)]);
    const watching=next(watcher,m=>m.type==='status');watcher.send(JSON.stringify({type:'watch',mirror:grant.watchToken}));await watching;
    watcher.send(JSON.stringify({type:'text',question:'Must not answer this'}));
    watcher.send(JSON.stringify({type:'audio',data:'AAAA',sampleRate:16000}));
    const mirrored=next(watcher,m=>m.type==='reply'&&m.done),original=next(source,m=>m.type==='reply'&&m.done);
    source.send(JSON.stringify({type:'start',name:'Mirror',mirror:producerToken}));
    assert.deepEqual(await mirrored,await original);
    assert.equal(speechCalls,greeting("Mirror").length);assert.equal(sttCalls,0);
    assert.equal(grant.room.opened,true);
    const denied=await ask(url,{type:'start',mirror:grant.watchToken},{until:m=>m.type==='error'});
    assert.equal(denied.at(-1).feature,'mirror');
  } finally {watcher.close();source.close();server.close();}
});

// ---- headset meters: each slider change compares with where the person started ----
test("slider changes rerun the real simulation and chart now against the start of the session", async () => {
  const profile = { name: "Maya", age: 21, sex: "female", income_per_year: 30000, savings: { tfsa: 2000, rrsp: 0, other: 500 }, saving_per_month: 100, retirement_age: 65, habits: { exercise_per_week: 2, sleep_hours: 7, smoker: false, drinks_per_week: 3 } };
  const { server, url } = await start({ speakFn: fakeSpeak, store: fakeStore({}, { maya: { profile } }) });
  try {
    const got = await session(url, [
      { type: "start", name: "Maya" },
      { type: "slider", name: "saving_per_month", value: 300 },
      { type: "slider", name: "smoker", value: true },
    ]);
    const facts = got.filter((m) => m.type === "facts");
    assert.equal(facts.length, 3, "one facts message at start and one per slider");
    const charts = got.filter((m) => m.type === "chart").map((m) => m.chart);
    const line = charts.find((c) => c.kind === "line");
    assert.deepEqual(line.datasets.map((d) => d.label), ["When you started", "Now"]);
    const at70 = (d) => d.data[line.labels.indexOf("70")];
    assert.ok(at70(line.datasets[1]) > at70(line.datasets[0]), "saving $300 instead of $100 shows more at 70");
    const range = charts.find((c) => c.kind === "range");
    assert.deepEqual(range.labels, ["Now", "When you started"]);
    assert.ok(range.datasets[1].data[0] < range.datasets[1].data[1], "smoking lowers the middle of the life expectancy range");
    assert.ok(facts[2].apparent_age_at_70 >= facts[1].apparent_age_at_70, "smoking doesn't make the face younger");
  } finally {
    server.close();
  }
});
