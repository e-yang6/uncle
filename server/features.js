// Which features are on, based on which keys are in the environment.
// The server must start with no keys at all and say what is off (AGENTS.md).

const FEATURES = [
  {
    name: "head-worker",
    env: "HEAD_WORKER_TOKEN",
    off: "Video-to-head builds are off; finished GLB files can still be opened from the head library",
  },
  {
    name: "voice",
    env: "ELEVENLABS_API_KEY",
    off: "ElevenLabs voice clone and speech are off; the sample voice or text is used instead",
  },
  {
    name: "gemini",
    env: "GEMINI_API_KEY",
    off: "Interview field extraction and the Gemini fallback voice are off",
  },
  {
    name: "model",
    env: "MODEL_URL",
    off: "The fine-tuned model is off; Gemini (if on) writes the future self's words",
  },
  {
    name: "aging",
    env: "AGING_URL",
    off: "The face-aging service is off; saved aged heads are used",
  },
];

export function featureStatus(env = process.env) {
  return FEATURES.map(({ name, env: key, off }) => {
    const on = Boolean(env[key] && env[key].trim());
    return { name, on, needs: key, ...(on ? {} : { note: off }) };
  });
}
