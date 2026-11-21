# How the parts talk (Uncle)

Person 1 owns this file. Change it first, then post on the board with @all.

## Interview fields (voice -> sim)
Gemini fills these from the interview; anything not mentioned stays on its default.
```json
{ "name": "Ethan", "age": 21, "sex": "male", "province": "ON",
  "income_per_year": 30000, "savings": { "tfsa": 2000, "rrsp": 0, "other": 500 },
  "saving_per_month": 100, "retirement_age": 65,
  "habits": { "exercise_per_week": 2, "sleep_hours": 7, "smoker": false, "drinks_per_week": 3 } }
```

## Facts sheet (sim -> words, head)
Every number the future self may say. Ranges are 10th / 50th / 90th percentile.
```json
{ "savings_70": { "low": 0, "median": 0, "high": 0 },
  "income_retired_per_year": { "low": 0, "median": 0, "high": 0 },
  "money_lasts_to_90_chance": 0.0,
  "life_expectancy": { "low": 0, "median": 0, "high": 0 },
  "healthy_years": { "low": 0, "median": 0, "high": 0 },
  "apparent_age_at_70": 70,
  "one_change": { "slider": "saving_per_month", "label": "saving $50 more a month" },
  "sources": [ { "value": "tfsa_limit", "url": "", "fetched_at": "" } ] }
```

## Placeholders (words -> fill-and-check)
The model writes `{savings_70.median}`, never a raw number. Unknown placeholder or raw number = rewrite once, then a template sentence.

## Sliders (xr -> sim)
`saving_per_month`, `exercise_per_week`, `sleep_hours`, `smoker`. The sim reruns and returns a new facts sheet in under 100 ms.

## Voice pipeline
The headset connects via WebSocket at `wss://<host>/voice`. One socket per session.

**Audio format:** all audio is 16-bit little-endian mono PCM, base64-encoded. Server to headset: 24000 Hz. Headset to server: 16000 Hz. Every message with audio includes a `sampleRate` field.

**Session start:** client sends `{ "type": "start", "name": "...", "sex": "male|female", "apparent_age": 70 }`. Server responds with a greeting as normal reply messages.

**Messages:**
- Client sends: `{ "type": "audio", "data": "<base64 PCM>", "sampleRate": 16000 }` (mic input; server detects end of speech)
- Client sends: `{ "type": "text", "question": "..." }` (typed or confirmed question)
- Client sends: `{ "type": "age", "apparent_age": 72 }` (slider moved; next sentences use the new age)
- Server sends: `{ "type": "transcript", "text": "..." }` (what the user said)
- Server sends: `{ "type": "reply", "sentence": "...", "audio": "<base64 PCM>|null", "sampleRate": 24000, "done": false }` (sentence by sentence; `done: true` on last; `audio: null` = text-only fallback)
- Server sends: `{ "type": "status", "state": "listening|thinking|speaking" }` (for headset UI)
- Server sends: `{ "type": "error", "feature": "...", "message": "..." }` (feature unavailable)
- Server sends: `{ "type": "chart", "chart": { "kind": "line|bar|range", "title": "...", "labels": ["..."], "datasets": [{ "label": "...", "data": [0] }] } }` (floating chart panel; sent alongside reply sentences when the topic has visualizable data; XR app renders and makes it grabbable)

## Head files (head -> xr)
One glTF binary (.glb) per head in `head/builds/<name>/head.glb`. The XR app loads by name. The .glb includes the mesh, texture, and blend shapes for mouth animation. Aged skin variants sit alongside as `head_age<N>.glb` (e.g. `head_age65.glb`, `head_age75.glb`) for slider blending.

## Profile endpoint (server -> sim)
`GET /api/profile/:name` returns the confirmed interview fields for a user, in the same shape as the interview fields above. The voice session uses this to run `simulate()` on saved profiles; without a saved profile it falls back to `fake-facts.json`.

## Saved head library (server)
- `/heads.html` lists, searches, uploads and opens saved scans. Existing `head/builds/<id>/head.glb` files are discovered automatically; the head builder and XR loading contract stay the same.
- `GET /api/heads` returns `{ heads: [{ id, name, createdAt, bytes, url, xrUrl }], uploadsEnabled }`. `?q=` filters names. `url` downloads the GLB; `xrUrl` opens that scan with live voice and the person's name.
- `POST /api/heads?name=<display name>` accepts a self-contained GLB v2 body, at most 50 MiB, with `Content-Type: model/gltf-binary` and `Authorization: Bearer <HEAD_LIBRARY_TOKEN>`. Returns the new head with status 201. Each upload gets a unique id; existing scans are never overwritten. Without the token configured, uploads return 503; reads still work.
- SQLite metadata lives in `head/builds/.library.sqlite`; GLBs remain in individual build folders. Back up the whole builds folder together. Neither files nor catalog belong in git. Uploaded scans are accessible to anyone with the app link, like the existing head files.

## Secrets
All in .env, never committed. Code must start without them and say which feature is off.
