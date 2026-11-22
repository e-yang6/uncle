// "Hmm, let me think" lines: played the moment the person stops talking, while the two Gemini calls
// and the maths run, so the wait never feels like dead air. No numbers in any line (the checker's
// rule), each line used once per session where possible, and every line goes through the same aging
// filter as the reply.
//
// Voice: FILLER_VOICE=stock (default) makes each line once in the stock voice and shares it across
// sessions (no credits per person). FILLER_VOICE=clone makes them in each person's cloned voice
// (about six short ElevenLabs lines per new person). FILLERS=0 turns fillers off.
export const FILLER_LINES = [
  "Hmm, let me think about that.",
  "Ooh, good question. Give me a second.",
  "Let me run the numbers on that.",
  "Hold on, let me work that out.",
  "Hmm. Let me see.",
  "Right, let me think back.",
  "Ah, that one I remember. One moment.",
  "Okay, let me figure that out for you.",
];

export const fillersEnabled = () => process.env.FILLERS !== "0";
export const fillerVoice = () => (process.env.FILLER_VOICE === "clone" ? "clone" : "stock");

const shared = new Map(); // "stock" or a voice id -> Map(line -> Promise<tts>)

// speak(text, { voiceId }) -> Promise<{ samples, sampleRate }>. Returns a bank for one session.
export function createFillerBank(speak, { voiceId, lines = FILLER_LINES, random = Math.random } = {}) {
  const key = fillerVoice() === "clone" && voiceId ? voiceId : "stock";
  if (!shared.has(key)) shared.set(key, new Map());
  const cache = shared.get(key);
  const ready = new Map(); // line -> tts, once made
  const used = new Set();

  function prepare(count = 6) {
    const pick = [...lines].sort(() => random() - 0.5).slice(0, count);
    for (const line of pick) {
      if (!cache.has(line)) cache.set(line, speak(line, key === "stock" ? {} : { voiceId: key }).catch(() => { cache.delete(line); return null; }));
      cache.get(line).then((tts) => { if (tts) ready.set(line, tts); });
    }
  }

  // A ready line, preferring ones not used yet in this session; null if none is ready.
  function take() {
    const all = [...ready.keys()];
    if (!all.length) return null;
    const fresh = all.filter((l) => !used.has(l));
    const pool = fresh.length ? fresh : all;
    const line = pool[Math.floor(random() * pool.length)];
    used.add(line);
    return { sentence: line, tts: ready.get(line) };
  }

  return { prepare, take, get readyCount() { return ready.size; } };
}

export const _resetFillerCache = () => shared.clear(); // tests
