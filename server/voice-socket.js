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
// NOT built yet: {type:"audio"} mic input (needs speech-to-text) and {type:"transcript"}.
import { WebSocketServer } from "ws";
import { speak as realSpeak } from "../voice/tts.js";
import { applyAging } from "../voice/filter.js";
import { agingParams, strengthForAge } from "../voice/aging.js";
import { floatToPcm16 } from "../voice/wav.js";
import { createStore } from "../voice/store.js";
import { getFacts as realGetFacts } from "../sim/facts.js";
import { answer, greeting } from "./brain.js";

const MAX_QUESTION = 500;

function send(ws, obj) {
  if (ws.readyState === ws.OPEN) ws.send(JSON.stringify(obj));
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

export function attachVoice(httpServer, { speakFn = realSpeak, getFacts = realGetFacts, store = createStore() } = {}) {
  const wss = new WebSocketServer({ server: httpServer, path: "/voice", maxPayload: 4 * 1024 * 1024 });

  wss.on("connection", (ws) => {
    // What we know about this person, set by the "start" message.
    const session = { name: null, sex: "neutral", apparentAge: null, voiceId: undefined, facts: null };
    let queue = Promise.resolve(); // one reply at a time, in order

    // Speak with the person's own clone; if that fails, fall back to the stock voice so the
    // conversation keeps going (PLAN.md: "if cloning fails, a ready-made voice, then text").
    async function speakOne(sentence) {
      try {
        return await speakFn(sentence, { voiceId: session.voiceId });
      } catch (err) {
        if (!session.voiceId) throw err;
        return await speakFn(sentence, {});
      }
    }

    async function say(sentences) {
      const started = performance.now();
      const facts = session.facts ?? getFacts();
      const strength = strengthForAge(session.apparentAge ?? facts.apparent_age_at_70);
      send(ws, { type: "status", state: "thinking" });
      // Start every sentence's speech at once, then send in order: sentence 1 plays while 2 and 3 are made.
      const jobs = sentences.map((s) => speakOne(s).then((tts) => ({ tts }), (error) => ({ error })));

      let reportedError = false;
      let spoke = false;
      for (let i = 0; i < sentences.length; i++) {
        const { tts, error } = await jobs[i];
        let audio = null;
        let sampleRate = 24000;
        if (tts) {
          const aged = applyAging(tts.samples, tts.sampleRate, agingParams(strength, session.sex));
          audio = floatToPcm16(aged).toString("base64");
          sampleRate = tts.sampleRate;
          if (!spoke) (spoke = true), send(ws, { type: "status", state: "speaking" });
        } else if (!reportedError) {
          reportedError = true;
          send(ws, { type: "error", feature: "voice", message: error?.message ?? "voice failed" });
        }
        send(ws, {
          type: "reply",
          sentence: sentences[i],
          audio,
          sampleRate,
          done: i === sentences.length - 1,
          ms: Math.round(performance.now() - started),
        });
      }
      send(ws, { type: "status", state: "listening" });
    }

    const enqueue = (fn) => {
      queue = queue.then(fn).catch((err) => send(ws, { type: "error", feature: "voice", message: err.message }));
    };

    send(ws, { type: "status", state: "listening" });

    ws.on("message", (raw) => {
      let msg;
      try {
        msg = JSON.parse(raw.toString());
      } catch {
        return send(ws, { type: "error", feature: "protocol", message: "messages must be JSON" });
      }

      switch (msg?.type) {
        case "start": {
          session.name = String(msg.name ?? "").trim().slice(0, 40) || null;
          session.sex = ["male", "female"].includes(msg.sex) ? msg.sex : "neutral";
          session.apparentAge = clampAge(msg.apparent_age);
          session.voiceId = session.name ? store.find(session.name)?.voiceId : undefined;
          // If this person confirmed their interview answers, the simulation runs on THEIR numbers.
          // Otherwise the sample facts sheet is used.
          const saved = session.name ? store.getProfile(session.name) : null;
          session.facts = saved ? getFacts(dropNulls(saved.profile)) : null;
          if (session.sex === "neutral" && saved?.profile?.sex) session.sex = saved.profile.sex;
          enqueue(() => say(greeting(session.name)));
          break;
        }
        case "age": {
          const age = clampAge(msg.apparent_age);
          if (age === null) return send(ws, { type: "error", feature: "protocol", message: "apparent_age must be a number" });
          session.apparentAge = age;
          break;
        }
        case "text": {
          const question = String(msg.question ?? "").trim().slice(0, MAX_QUESTION);
          if (!question) return send(ws, { type: "error", feature: "protocol", message: "question is empty" });
          enqueue(() => say(answer(question, session.facts ?? getFacts())));
          break;
        }
        case "audio":
          send(ws, { type: "error", feature: "speech-to-text", message: "microphone input is not built yet" });
          break;
        default:
          break; // unknown types are ignored, so newer clients don't break older servers
      }
    });
  });

  return wss;
}
