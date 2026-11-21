// ElevenLabs text-to-speech. Returns raw samples so our aging filter can work on them.
import { pcm16ToFloat } from "./wav.js";

export const SAMPLE_RATE = 24000;
// "Will": a premade stock voice, standing in for the user's own clone until we have one.
export const DEFAULT_VOICE_ID = "bIHbv24MWmeRgasZH58o";
const MODEL_ID = "eleven_flash_v2_5"; // lowest-latency model

export async function speak(text, { apiKey = process.env.ELEVENLABS_API_KEY, voiceId } = {}) {
  if (!apiKey) throw new Error("voice is off: set ELEVENLABS_API_KEY");
  const voice = voiceId || process.env.ELEVENLABS_VOICE_ID || DEFAULT_VOICE_ID;
  const url = `https://api.elevenlabs.io/v1/text-to-speech/${voice}?output_format=pcm_${SAMPLE_RATE}`;
  const t0 = performance.now();
  const res = await fetch(url, {
    method: "POST",
    headers: { "xi-api-key": apiKey, "content-type": "application/json" },
    body: JSON.stringify({ text, model_id: MODEL_ID }),
  });
  const ttfbMs = performance.now() - t0; // time until the response started
  if (!res.ok) {
    const detail = (await res.text()).slice(0, 200);
    throw new Error(`ElevenLabs ${res.status}: ${detail}`);
  }
  const bytes = Buffer.from(await res.arrayBuffer());
  return {
    samples: pcm16ToFloat(bytes),
    sampleRate: SAMPLE_RATE,
    ttfbMs: Math.round(ttfbMs),
    totalMs: Math.round(performance.now() - t0),
  };
}
