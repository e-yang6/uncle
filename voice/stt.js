// Speech-to-text: ElevenLabs realtime over a raw WebSocket (same API key as the voice).
// We stream the headset's mic audio in; ElevenLabs decides when the person has stopped
// talking (commit_strategy=vad) and sends back the finished sentence. That is the
// "server detects end of speech" part of CONTRACTS.md.
//
// Protocol (from ElevenLabs' realtime docs):
//   client -> {message_type:"input_audio_chunk", audio_base_64, commit:false, sample_rate}
//   server -> session_started | partial_transcript | committed_transcript | <error types>
import WebSocket from "ws";

export const STT_URL = "wss://api.elevenlabs.io/v1/speech-to-text/realtime";
// How long a pause counts as "finished talking". Shorter = faster reply, but cuts people off
// mid-thought. PROVISIONAL: tune against real conversations (PLAN.md Part 4 delay target).
export const SILENCE_SECS = 0.5;

const ERROR_TYPES = new Set([
  "error", "auth_error", "quota_exceeded", "rate_limited", "unaccepted_terms", "queue_overflow",
  "resource_exhausted", "session_time_limit_exceeded", "input_error", "invalid_request",
  "chunk_size_exceeded", "transcriber_error",
]);

// One speech-to-text session. Chunks sent before the socket is open are held and sent on open.
export function createSttSession({
  apiKey = process.env.ELEVENLABS_API_KEY,
  baseUrl = STT_URL,
  model = process.env.ELEVENLABS_STT_MODEL || "scribe_v2_realtime",
  silenceSecs = SILENCE_SECS,
  onTranscript,
  onPartial = () => {},
  onError = () => {},
  onClose = () => {},
} = {}) {
  if (!apiKey) throw new Error("speech-to-text is off: set ELEVENLABS_API_KEY");
  const q = new URLSearchParams({
    model_id: model,
    audio_format: "pcm_16000",
    commit_strategy: "vad",
    vad_silence_threshold_secs: String(silenceSecs),
  });
  const ws = new WebSocket(`${baseUrl}?${q}`, { headers: { "xi-api-key": apiKey } });
  let open = false;
  let closed = false;
  const pending = [];

  const transmit = (b64, sampleRate) =>
    ws.send(JSON.stringify({ message_type: "input_audio_chunk", audio_base_64: b64, commit: false, sample_rate: sampleRate }));

  ws.on("open", () => {
    open = true;
    for (const [b64, rate] of pending.splice(0)) transmit(b64, rate);
  });
  ws.on("message", (raw) => {
    let m;
    try {
      m = JSON.parse(raw.toString());
    } catch {
      return;
    }
    if (m.message_type === "committed_transcript") {
      const text = String(m.text ?? "").trim();
      if (text) onTranscript(text);
    } else if (m.message_type === "partial_transcript") {
      onPartial(String(m.text ?? ""));
    } else if (ERROR_TYPES.has(m.message_type)) {
      onError(`${m.message_type}: ${m.error ?? "speech-to-text failed"}`);
    }
  });
  ws.on("error", (err) => onError(`could not reach speech-to-text (${err.message})`));
  ws.on("close", () => {
    closed = true;
    onClose();
  });

  return {
    // base64 16-bit mono PCM at the given rate (the headset sends 16000).
    send(b64, sampleRate = 16000) {
      if (closed) return false;
      if (open) transmit(b64, sampleRate);
      else pending.push([b64, sampleRate]);
      return true;
    },
    close() {
      closed = true;
      try {
        ws.close();
      } catch {
        /* already closed */
      }
    },
    get isOpen() {
      return !closed;
    },
  };
}
