// ElevenLabs Instant Voice Clone: make a copy of someone's voice from a recording,
// and delete it again. The recording is the interview audio (PLAN.md Part 4).

const API = "https://api.elevenlabs.io/v1";

const EXT = { "audio/webm": "webm", "audio/ogg": "ogg", "audio/mp4": "m4a", "audio/mpeg": "mp3", "audio/wav": "wav", "audio/x-wav": "wav" };

export function extensionFor(mime = "") {
  return EXT[mime.split(";")[0].trim().toLowerCase()] ?? "webm";
}

export async function createClone({ name, audio, mime, apiKey = process.env.ELEVENLABS_API_KEY, fetchFn = fetch }) {
  if (!apiKey) throw new Error("voice is off: set ELEVENLABS_API_KEY");
  const form = new FormData();
  form.append("name", `Uncle - ${name}`);
  form.append("description", "Uncle hackathon demo clone. Delete via the app.");
  // Hackathon rooms are noisy; let ElevenLabs clean the recording first.
  form.append("remove_background_noise", "true");
  form.append("files", new Blob([audio], { type: mime || "audio/webm" }), `${name}.${extensionFor(mime)}`);
  const res = await fetchFn(`${API}/voices/add`, { method: "POST", headers: { "xi-api-key": apiKey }, body: form });
  if (!res.ok) throw new Error(`ElevenLabs ${res.status}: ${(await res.text()).slice(0, 300)}`);
  const body = await res.json();
  if (!body.voice_id) throw new Error("ElevenLabs did not return a voice id");
  return { voiceId: body.voice_id };
}

export async function deleteClone({ voiceId, apiKey = process.env.ELEVENLABS_API_KEY, fetchFn = fetch }) {
  if (!apiKey) throw new Error("voice is off: set ELEVENLABS_API_KEY");
  const res = await fetchFn(`${API}/voices/${encodeURIComponent(voiceId)}`, { method: "DELETE", headers: { "xi-api-key": apiKey } });
  // 404 means it is already gone, which is what we wanted.
  if (!res.ok && res.status !== 404) throw new Error(`ElevenLabs ${res.status}: ${(await res.text()).slice(0, 300)}`);
}
