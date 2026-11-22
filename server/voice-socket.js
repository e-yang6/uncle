// The /voice WebSocket (CONTRACTS.md "Voice pipeline").
//
// Built:
//   client -> {type:"start", name, sex, apparent_age}   begins a session; we greet by name
//   client -> {type:"text", question}                   a typed or confirmed question
//   client -> {type:"age", apparent_age}                slider moved; next sentences use it
//   server -> {type:"reply", sentence, audio, sampleRate, done}   one per sentence (+ ms: delay)
//   server -> {type:"status", state}                    listening | thinking | speaking
//   server -> {type:"error", feature, message}
//   reply.audio is null when the voice is off: the headset shows text only (text fallback).
//   client -> {type:"audio", data, sampleRate}         mic audio (16-bit mono PCM, 16000 Hz) streamed continuously
//   server -> {type:"transcript", text}                what the person said, sent when they stop talking
// Mic audio is dropped while the future self is still talking (plus a short tail), so the
// headset's mic can't hear the speakers and make Uncle answer itself.
import { mirrorAccess } from "./mirror-sessions.js";
import { WebSocketServer } from "ws";
import { speak as realSpeak } from "../voice/tts.js";
import { applyAging } from "../voice/filter.js";
import { agingParams, strengthForAge } from "../voice/aging.js";
import { floatToPcm16 } from "../voice/wav.js";
import { createStore } from "../voice/store.js";
import { createSttSession } from "../voice/stt.js";
import { loadSamples, clipFor } from "../voice/samples.js";
import { getFacts as realGetFacts } from "../sim/facts.js";
import { reply, replyStream, greeting } from "./brain.js";
import { chartForReply, chartForSlider } from "./charts.js";
import { snapshotChart } from "./life-charts.js";
import { simulateDetailed } from "../sim/engine.js";
import { lookTiers } from "./look.js";
import { compareCard } from "./cards.js";

const SPEAK_TIMEOUT_MS = 4000;
const MAX_QUESTION = 500;

function send(ws, obj) {
  const data = JSON.stringify(obj);
  if (ws.readyState !== ws.OPEN) return;
  ws.send(data);
  if (ws.mirrorHistory) {
    ws.mirrorHistory.push(data);
    while (ws.mirrorHistory.length > 8 || ws.mirrorHistory.reduce((n,item)=>n+item.length,0) > 262144) ws.mirrorHistory.shift();
  }
  for (const peer of ws.mirrorViewers ?? []) {
    if (peer.readyState === peer.OPEN && peer.bufferedAmount < 4 * 1024 * 1024) peer.send(data);
  }
}

// The simulation's merge lets a nested null overwrite one of its defaults (for example
// habits.drinks_per_week: null), so send it only the fields the person actually gave us.
export function dropNulls(obj) {
  if (Array.isArray(obj) || obj === null || typeof obj !== "object") return obj;
  const out = {};
  for (const [k, v] of Object.entries(obj)) {
    if (v === null || v === undefined) continue;
    const cleaned = dropNulls(v);
    if (cleaned !== null && typeof cleaned === "object" && !Array.isArray(cleaned) && Object.keys(cleaned).length === 0) continue;
    out[k] = cleaned;
  }
  return out;
}

const clampAge = (n) => (Number.isFinite(Number(n)) ? Math.min(100, Math.max(20, Number(n))) : null);

export function attachVoice(httpServer, { speakFn = realSpeak, getFacts = realGetFacts, store = createStore(), sttFactory = createSttSession, writeFn, samples = loadSamples(), streamReplies = process.env.STREAM_REPLY === "1" } = {}) {
  const wss = new WebSocketServer({ server: httpServer, path: "/voice", maxPayload: 4 * 1024 * 1024 });

  const rooms = new Map();
  wss.on("connection", (ws) => {
    let mirrorRoom = null;
    function joinMirror(token, role) {
      const grant = mirrorAccess(token);
      if (!grant || grant.role !== role || mirrorRoom) return false;
      if (!rooms.has(grant.room)) rooms.set(grant.room, {viewers:new Set(), producer:null, history:[]});
      mirrorRoom = rooms.get(grant.room);
      if (role === "viewer") { mirrorRoom.viewers.add(ws); ws.isMirrorViewer = true; }
      else {
        if (mirrorRoom.producer && mirrorRoom.producer !== ws) mirrorRoom.producer.close();
        grant.room.opened = true;
        mirrorRoom.producer = ws; ws.mirrorViewers = mirrorRoom.viewers; ws.mirrorHistory = mirrorRoom.history;
      }
      return true;
    }
    ws.on("close", () => {
      if (!mirrorRoom) return;
      mirrorRoom.viewers.delete(ws);
      if (mirrorRoom.producer === ws) mirrorRoom.producer = null;
      if (!mirrorRoom.producer && !mirrorRoom.viewers.size) {
        for (const [key, value] of rooms) if (value === mirrorRoom) rooms.delete(key);
      }
    });
    // What we know about this person, set by the "start" message.
    const session = { name: null, sex: "neutral", apparentAge: null, voiceId: undefined, facts: null, path: null, baseline: null, history: [], speech: "", profile: null };
    let queue = Promise.resolve(); // one reply at a time, in order
    let stt = null; // speech-to-text session, opened when mic audio first arrives
    let playbackUntil = 0; // when the headset will finish playing what we last sent (ms clock)
    let interrupted = false; // set true when the user speaks while Uncle is talking

    // Speak with the person's own clone; if that fails, fall back to the stock voice so the
    // conversation keeps going (PLAN.md: "if cloning fails, a ready-made voice, then text").
    // A slow ElevenLabs call must not stall the conversation: after SPEAK_TIMEOUT_MS give up on the clone.
    const withTimeout = (promise, ms, what) =>
      Promise.race([promise, new Promise((_, reject) => setTimeout(() => reject(new Error(`${what} took longer than ${ms} ms`)), ms).unref())]);
    async function speakOne(sentence) {
      try {
        try {
          return await withTimeout(speakFn(sentence, { voiceId: session.voiceId }), SPEAK_TIMEOUT_MS, "voice");
        } catch (err) {
          if (!session.voiceId) throw err;
          return await withTimeout(speakFn(sentence, {}), SPEAK_TIMEOUT_MS, "stock voice");
        }
      } catch (err) {
        // The speech service is down or out of credits: play a pre-recorded line if we have one, else text only.
        const clip = clipFor(samples, sentence);
        if (!clip) throw err;
        return { samples: clip.samples, sampleRate: clip.sampleRate, clipText: clip.text };
      }
    }

    // Sends one sentence (waiting for its speech job), aged, in order. Shared by the batch and streaming paths.
    function makeEmitter(meta) {
      const started = performance.now();
      const facts = session.facts ?? getFacts();
      const strength = strengthForAge(session.apparentAge ?? facts.apparent_age_at_70);
      let reportedError = false;
      let spoke = false;
      let n = 0;
      return async (sentence, job, done) => {
        if (interrupted) return; // user started talking — drop remaining sentences
        const { tts, error } = await job;
        let audio = null;
        let sampleRate = 24000;
        if (tts) {
          const aged = applyAging(tts.samples, tts.sampleRate, agingParams(strength, session.sex));
          audio = floatToPcm16(aged).toString("base64");
          sampleRate = tts.sampleRate;
          if (tts.clipText && !reportedError) (reportedError = true), send(ws, { type: "error", feature: "voice", message: "live voice is unavailable; playing recorded lines where we have them" });
          if (!spoke) (spoke = true), send(ws, { type: "status", state: "speaking" });
          // Remember how long this will play, so mic audio during it is ignored (echo guard).
          playbackUntil = Math.max(playbackUntil, performance.now()) + (aged.length / tts.sampleRate) * 1000;
        } else if (!reportedError) {
          reportedError = true;
          send(ws, { type: "error", feature: "voice", message: error?.message ?? "voice failed" });
        }
        const first = n++ === 0;
        const m = typeof meta === "function" ? meta() : meta;
        send(ws, {
          type: "reply",
          sentence: tts?.clipText ?? sentence, // a recorded clip says its own words
          audio,
          sampleRate,
          done,
          ms: Math.round(performance.now() - started),
          ...(first && m ? { timing: { thinkMs: m.thinkMs, source: m.source } } : {}),
        });
        if (first && m) console.log(`[voice] reply: write ${m.thinkMs} ms (${m.source}${m.streamed ? ", streamed" : ""}), first sentence spoken ${Math.round(performance.now() - started)} ms later${session.voiceId ? " (clone)" : " (stock)"}`);
      };
    }

    // Write the answer (model or Gemini, checked; keyword stand-in if that fails), remember the exchange, speak it.
    // Facts sheet and savings by age for a profile in one simulation run (the real engine);
    // a test's stand-in getFacts gives facts only.
    function simulateProfile(input) {
      if (getFacts !== realGetFacts) return { facts: getFacts(input), path: null };
      const d = simulateDetailed(input);
      return { facts: d.facts, path: d.savingsByAge, retireAge: Number(input.retirement_age ?? 65) };
    }

    // Built on the next turn of the event loop so a card that takes a few hundred ms to compute (the habit cards
    // run the simulation twice) never delays the reply's first word.
    function sendChart(question, profile, facts) {
      const path = session.path;
      setTimeout(() => {
        if (ws.readyState !== 1) return;
        const chart = chartForReply(question, profile, facts, path);
        if (chart) send(ws, { type: "chart", chart });
      }, 0);
    }

    async function respond(question) {
      interrupted = false;
      send(ws, { type: "status", state: "thinking" });
      const facts = session.facts ?? getFacts();
      const t0 = performance.now();
      if (streamReplies) return respondStreaming(question, facts, t0);
      const { sentences, source } = await reply(question, facts, { history: session.history, name: session.name, speech: session.speech, writeFn });
      const thinkMs = Math.round(performance.now() - t0);
      sendChart(question, session.profile, facts);
      session.history.push({ role: "you", text: question }, { role: "future", text: sentences.join(" ") });
      session.history = session.history.slice(-12);
      return say(sentences, { thinkMs, source });
    }

    // Streaming: each sentence is checked and starts being spoken the moment the model finishes writing it.
    // The reply ends with an empty sentence marked done (the count is not known until the model stops).
    async function respondStreaming(question, facts, t0) {
      let meta = null;
      const emit = makeEmitter(() => meta);
      const spoken = [];
      let chain = Promise.resolve();
      let chartSent = false;
      for await (const { sentence, source } of replyStream(question, facts, { history: session.history, name: session.name, speech: session.speech, writeFn })) {
        if (interrupted) break; // user started talking — stop generating
        if (!meta) meta = { thinkMs: Math.round(performance.now() - t0), source, streamed: source === "model" };
        if (!chartSent) { chartSent = true; sendChart(question, session.profile, facts); }
        spoken.push(sentence);
        const job = speakOne(sentence).then((tts) => ({ tts }), (error) => ({ error }));
        chain = chain.then(() => emit(sentence, job, false));
      }
      await chain;
      send(ws, { type: "reply", sentence: "", audio: null, sampleRate: 24000, done: true });
      session.history.push({ role: "you", text: question }, { role: "future", text: spoken.join(" ") });
      session.history = session.history.slice(-12);
      send(ws, { type: "status", state: "listening" });
    }

    async function say(sentences, meta) {
      send(ws, { type: "status", state: "thinking" });
      const emit = makeEmitter(meta);
      // Start every sentence's speech at once, then send in order: sentence 1 plays while 2 and 3 are made.
      const jobs = sentences.map((s) => speakOne(s).then((tts) => ({ tts }), (error) => ({ error })));
      for (let i = 0; i < sentences.length; i++) await emit(sentences[i], jobs[i], i === sentences.length - 1);
      send(ws, { type: "status", state: "listening" });
    }

    function openStt() {
      try {
        stt = sttFactory({
          onTranscript: (text) => {
            send(ws, { type: "transcript", text });
            enqueue(() => respond(text));
          },
          onError: (message) => {
            stt = null;
            send(ws, { type: "error", feature: "speech-to-text", message });
          },
          onClose: () => {
            stt = null; // it closes itself after ~15 s with no audio; we reopen on the next chunk
          },
        });
      } catch (err) {
        stt = null;
        send(ws, { type: "error", feature: "speech-to-text", message: err.message });
      }
    }

    const enqueue = (fn) => {
      queue = queue.then(fn).catch((err) => send(ws, { type: "error", feature: "voice", message: err.message }));
    };

    send(ws, { type: "status", state: "listening" });

    ws.on("close", () => { stt?.close(); clearTimeout(session.sliderTimer); });
    ws.on("message", (raw) => {
      let msg;
      try {
        msg = JSON.parse(raw.toString());
      } catch {
        return send(ws, { type: "error", feature: "protocol", message: "messages must be JSON" });
      }

      if (ws.isMirrorViewer) {
        if (msg?.type === "end" && mirrorRoom?.producer?.readyState === mirrorRoom.producer.OPEN) {
          mirrorRoom.producer.send(JSON.stringify({type:"end"}));
        }
        return;
      }
      if (msg?.type === "watch") {
        if (!joinMirror(msg.mirror, "viewer")) return send(ws, {type:"error",feature:"mirror",message:"This mirror session expired."});
        send(ws, {type:"status",state:"listening"});
        for (const data of mirrorRoom.history) ws.send(data);
        return;
      }
      switch (msg?.type) {
        case "start": {
          if (msg.mirror && !joinMirror(msg.mirror, "producer")) return send(ws, {type:"error",feature:"mirror",message:"This mirror session expired."});
          session.name = String(msg.name ?? "").trim().slice(0, 40) || null;
          session.sex = ["male", "female"].includes(msg.sex) ? msg.sex : "neutral";
          session.apparentAge = clampAge(msg.apparent_age);
          session.voiceId = session.name ? store.find(session.name)?.voiceId : undefined;
          // If this person confirmed their interview answers, the simulation runs on THEIR numbers.
          // Otherwise the sample facts sheet is used.
          const saved = session.name ? store.getProfile(session.name) : null;
          session.profile = saved ? dropNulls(saved.profile) : null;
          const run = session.profile ? simulateProfile(session.profile) : null;
          session.facts = run?.facts ?? null;
          session.path = run?.path ?? null;
          // Where this person started: meter charts compare against this, not the last move.
          session.baseline = run;
          session.speech = saved?.speech ?? "";
          if (session.sex === "neutral" && saved?.profile?.sex) session.sex = saved.profile.sex;
          const startFacts = session.facts ?? getFacts();
          send(ws, { type: "facts", apparent_age_at_70: startFacts.apparent_age_at_70, ...lookTiers(startFacts) });
          // First panel of the session: what they have saved today (their own answers).
          const first = snapshotChart(session.profile);
          if (first) send(ws, { type: "chart", chart: first });
          enqueue(() => say(greeting(session.name)));
          break;
        }
        case "age": {
          const age = clampAge(msg.apparent_age);
          if (age === null) return send(ws, { type: "error", feature: "protocol", message: "apparent_age must be a number" });
          session.apparentAge = age;
          break;
        }
        case "slider": {
          const SLIDERS = { saving_per_month: "number", exercise_per_week: "number", sleep_hours: "number", smoker: "boolean" };
          const sName = String(msg.name ?? "");
          if (!(sName in SLIDERS)) return send(ws, { type: "error", feature: "protocol", message: "unknown slider: " + sName });
          if (!session.profile) return send(ws, { type: "error", feature: "protocol", message: "no profile saved for this session" });
          const val = SLIDERS[sName] === "boolean" ? Boolean(msg.value) : Number(msg.value);
          if (SLIDERS[sName] === "number" && !Number.isFinite(val)) return send(ws, { type: "error", feature: "protocol", message: "value must be a number" });
          const before = session.sliderBase ?? session.profile; // the profile when this drag began
          session.sliderBase = before;
          const updated = { ...session.profile };
          if (sName === "saving_per_month") updated.saving_per_month = val;
          else updated.habits = { ...updated.habits, [sName]: val };
          session.profile = updated;
          const run = simulateProfile(dropNulls(updated));
          session.facts = run.facts;
          session.path = run.path;
          send(ws, { type: "facts", apparent_age_at_70: session.facts.apparent_age_at_70, ...lookTiers(session.facts) });
          // Optional extra (COMPARE_CARDS=1): a before/after card for the drag instead of the standard slider chart.
          if (process.env.COMPARE_CARDS === "1") {
            clearTimeout(session.sliderTimer);
            const after = session.profile;
            session.sliderTimer = setTimeout(() => {
              const base = session.sliderBase;
              session.sliderBase = null;
              const chart = compareCard(sName, base, after, val);
              if (chart && ws.readyState === 1) send(ws, { type: "chart", chart });
            }, 400);
          } else {
            const chart = chartForSlider(sName, session.baseline ?? run, run);
            if (chart) send(ws, { type: "chart", chart });
          }
          break;
        }
        case "text": {
          const question = String(msg.question ?? "").trim().slice(0, MAX_QUESTION);
          if (!question) return send(ws, { type: "error", feature: "protocol", message: "question is empty" });
          enqueue(() => respond(question));
          break;
        }
        case "audio": {
          if (typeof msg.data !== "string" || !msg.data) break;
          // If Uncle is still talking but the user starts speaking, interrupt: stop sending
          // remaining sentences and switch to listening. Drop this chunk (likely echo/bleed)
          // and let the next audio chunk open STT normally.
          if (performance.now() < playbackUntil + 300) {
            interrupted = true;
            playbackUntil = 0;
            send(ws, { type: "status", state: "listening" });
            break; // discard this echo chunk; next audio opens STT
          }
          if (!stt) openStt();
          stt?.send(msg.data, Number(msg.sampleRate) || 16000);
          break;
        }
        case "end": {
          // User pressed End in the headset — tell mirror viewers the session is over.
          send(ws, { type: "end" });
          stt?.close();
          stt = null;
          break;
        }
        default:
          break; // unknown types are ignored, so newer clients don't break older servers
      }
    });
  });

  return wss;
}
