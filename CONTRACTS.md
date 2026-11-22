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
- Client sends: `{ "type": "slider", "name": "saving_per_month|exercise_per_week|sleep_hours|smoker", "value": 150 }` (slider moved; server reruns simulate() on the session profile and responds with a `facts` message and optionally a `chart`)
- Server sends: `{ "type": "facts", "apparent_age_at_70": 72, "wealth_tier": 1, "health_tier": 4 }` (sent after session start and after each slider change; the headset uses the age to age the face and the two tiers for outfit, backdrop and posture, see Look tiers below)
- Server sends: `{ "type": "transcript", "text": "..." }` (what the user said)
- Server sends: `{ "type": "reply", "sentence": "...", "audio": "<base64 PCM>|null", "sampleRate": 24000, "done": false }` (sentence by sentence; `done: true` on last; `audio: null` = text-only fallback)
- Server sends: `{ "type": "status", "state": "listening|thinking|speaking" }` (for headset UI)
- Server sends: `{ "type": "error", "feature": "...", "message": "..." }` (feature unavailable)
- Server sends: `{ "type": "chart", "chart": { "kind": "line|bar|range", "title": "...", "labels": ["..."], "datasets": [{ "label": "...", "data": [0] }] } }` (floating chart panel; sent alongside reply sentences when the topic has visualizable data; XR app renders and makes it grabbable)
- Client sends: `{ "type": "end" }` (user pressed End in the headset; server echoes it to mirror viewers, both sides show "Session ended")
- Server sends: `{ "type": "end" }` (session ended; mirror viewers show "Session ended" and stop playback)

## Laptop casting
The Quest casts its full view (video and audio) to a laptop using the Quest's built-in cast-to-browser feature (cast to a Chrome tab at oculus.com/casting). This shows judges EXACTLY what the headset user sees. The mirror WebSocket relay is a secondary fallback: it forwards reply, chart, facts and end messages to a spectator page that renders its own 3D scene, but it is not an exact screen mirror. For demos, always use Quest casting first.

## Look tiers (server -> xr): outfit, backdrop, posture
Added at Jeffrey's request, proposed to Person 1 (Ethan) to confirm or revert. LIVE in the server (server/look.js).
`wealth_tier` and `health_tier` are each 1 to 4, or `null` if the facts sheet lacked the number (the headset then keeps its middle look, tier 2). They are read from the facts sheet only: `wealth_tier` from `savings_70.median` (cut-offs at $20,000 / $150,000 / $400,000) and `health_tier` from `healthy_years.median` (cut-offs at 72 / 76 / 79). The cut-offs are display choices set from the simulation's own spread across 300 random profiles so every tier appears; they are never spoken and never shown as numbers. Tune them only in server/look.js. They change with every slider move, so the headset should blend between looks, not snap.

Four looks the headset (xr/head, Isaac) prepares. Names are for the team; the person never sees them. Every tier must look warm and dignified: a low-savings future looks modest and comfortable, never poor or sad (PLAN.md: agency, not fear).

| wealth_tier | Name | Outfit | Backdrop behind the mirror |
|---|---|---|---|
| 1 | Modest | Soft knit or plain tee, no accessories | A small, tidy, lived-in room |
| 2 | Comfortable | Collared shirt or cardigan | A cosy living room with a window |
| 3 | Established | Blazer or good coat, a watch | A bright open home with a garden view |
| 4 | Affluent | Tailored jacket, chain or pearls, a watch | A grand house or estate in the distance |

| health_tier | Look |
|---|---|
| 1 | Slower posture, softer shoulders, a cane or armrest nearby |
| 2 | Slightly rounded shoulders |
| 3 | Upright and easy |
| 4 | Upright, bright eyes, relaxed and strong |

The upper body (shoulders to chest) is new: today head.glb ends at the neck, so the outfits are drawn in xr/ on top of any saved head with no rebuild, like the aging shader.

### More pop-up cards (BUILT: server/cards.js sends them, xr/cards.js draws them; on by default, NEW_CARDS=0 turns them off)
New `chart.kind` values, same envelope as the existing `chart` message; every number comes from the simulation. With `NEW_CARDS=0` the server stays on the old line / range / bar charts. `stat`, `habit` and `compare` may carry an extra `note` string (a short caveat to print small under the card). `stat` and `habit` are sent in answer to a question (about a number, or about smoking / drinking / exercise / sleep, and only when the habit can be improved and the simulated gain is real); `compare` is an OPTIONAL extra (server setting `COMPARE_CARDS=1`; off by default, the standard slider chart is Ethan's chartForSlider): sent once, about 0.4 s after a slider drag settles, comparing where the drag began with where it ended (savings at 70 for saving_per_month, years in good health for the others). Before/after pairs run on 10,000 to 20,000 lives so luck is not shown as an effect. Habit and compare numbers are the typical (median) value. The XR app should render an unknown kind as nothing rather than failing.
- `stat`: one big number with its range. `{ "kind": "stat", "title": "Savings at 70", "value": "$336,000", "range": "$11,000 to $620,000", "note": "about half of people like you end up above this" }` (value and range are already formatted text, from the same filler as the spoken numbers).
- `compare`: before and after a slider. `{ "kind": "compare", "title": "Save $50 more a month", "labels": ["Now", "With the change"], "datasets": [{ "label": "Savings at 70", "data": [0, 0] }] }`
- `habit`: one habit's effect. `{ "kind": "habit", "title": "Exercise", "labels": ["0 times a week", "3 times a week"], "datasets": [{ "label": "Healthy years", "data": [0, 0] }] }`

### Life charts (server/life-charts.js, drawn by xr/charts.js; proposed in PR #2)
Same `chart` envelope. Sent with no flag: an older headset ignores kinds it can't draw. `now` is the person's current age. Life expectancy never appears in these as a single age.
- `snapshot`: saved today, from the interview answers. Sent once right after `start` when the person has a saved profile, and for questions about today ("right now", "so far", TFSA, RRSP). `{ "kind": "snapshot", "title": "Saved today", "labels": ["TFSA", "RRSP", "Other"], "datasets": [{ "label": "Balance", "data": [2000, 0, 500] }] }`
- `chance`: `money_lasts_to_90_chance` (0 to 1), for "will it last / enough" questions. `{ "kind": "chance", "title": "Money lasting", "labels": ["Money lasts to 90"], "datasets": [{ "label": "of simulated lives that reach 90", "data": [0.77] }] }`
- `milestones`: retirement age and `healthy_years.median`, for goal / plan questions. `{ "kind": "milestones", "title": "Milestones", "now": 21, "labels": ["Retirement", "Healthy until about"], "datasets": [{ "label": "Age", "data": [65, 76] }] }`
- `timeline`: the same two ages drawn as a life of year ticks, for "when / what age" questions. `{ "kind": "timeline", "title": "Your life", "now": 21, "labels": ["Retire", "Healthy to about"], "datasets": [{ "label": "Age", "data": [65, 76] }] }`

### Savings line and slider charts (PR #2)
- The `line` savings chart is the simulation's median savings at each age among lives still alive (`simulateDetailed().savingsByAge`), not a separate calculation. It runs from today's age to 90 and may carry an optional `"retire_age": 65` so the headset can label the value at retirement.
- With `NEW_CARDS` off, a `slider` reply's chart compares now with the start of the session: `saving_per_month` gives a `line` with datasets "When you started" then "Now" (the headset draws the first dashed); habit sliders give a `range` with rows "Now" and "When you started".
- Simulation runs are seeded (same input, same numbers), so a slider's effect is never random noise.

## Head files (head -> xr)
One glTF binary (.glb) per head in `head/builds/<name>/head.glb`. The XR app loads by name. The .glb includes the mesh, texture, and blend shapes for mouth animation. Aged skin variants sit alongside as `head_age<N>.glb` (e.g. `head_age65.glb`, `head_age75.glb`) for slider blending.

## Profile endpoint (server -> sim)
`GET /api/profile/:name` returns the confirmed interview fields for a user, in the same shape as the interview fields above. The voice session uses this to run `simulate()` on saved profiles; without a saved profile it falls back to `fake-facts.json`.

## Saved head library (server)
- `/heads.html` lists, searches, uploads and opens saved scans. Existing `head/builds/<id>/head.glb` files are discovered automatically; the head builder and XR loading contract stay the same.
- `GET /api/heads` returns `{ heads: [{ id, name, createdAt, bytes, url, xrUrl }], uploadsEnabled }`. `?q=` filters names. `url` downloads the GLB; `xrUrl` opens that scan with live voice and the person's name.
- `POST /api/heads?name=<display name>` accepts a self-contained GLB v2 body, at most 50 MiB, with `Content-Type: model/gltf-binary` and `Authorization: Bearer <HEAD_LIBRARY_TOKEN>`. Returns the new head with status 201. Each upload gets a unique id; existing scans are never overwritten. Without the token configured, uploads return 503; reads still work.
- SQLite metadata lives in `head/builds/.library.sqlite`; GLBs remain in individual build folders. Back up the whole builds folder together. Neither files nor catalog belong in git. Uploaded scans are accessible to anyone with the app link, like the existing head files.

## Video-to-head jobs (server + outbound Mac worker)
- Main onboarding requires no entered access code. `POST /api/head-sessions` issues a random, two-hour `sessionToken` when the worker is configured. A token can create one video job and read only that job's status using the existing bearer header. Token hashes/bindings persist in the private job database across server restarts. Issuance is capped at 60/hour per connection address and 1,000/hour overall; the existing 10-job queue and file-size caps still apply. No token grants access to raw videos, worker routes or GLB uploads.
- `POST /api/head-jobs?name=<name>&extension=mov|mp4|m4v|webm` accepts a raw video body (up to 250 MiB), using an unused scan-session bearer token or the existing staff upload key. Returns `{ job }` with status 202. Jobs and source videos live in private, ignored `captures/head-jobs/`, never under static head serving. At most 10 unfinished jobs are accepted.
- `GET /api/head-jobs/:id` (its bound scan-session token or staff key) returns `{ job, workerOnline }`. Job fields: `id`, `name`, `status` (`uploading|queued|building|completed|failed`), `stage`, `createdAt`, `updatedAt`, `error`, and `head` (the saved-head record on success, otherwise null). Errors are user-safe; internal paths/logs are not returned.
- A Mac runs `node --env-file-if-exists=.env server/head-worker.js` with `HEAD_SERVER_URL` and a separate `HEAD_WORKER_TOKEN`. It uses the existing `head/.venv/bin/python -u -m uncle_head.build <video> <job-id>` without changing the head pipeline. One build per worker, with a 20-minute limit.
- Worker routes all require the worker bearer key: `POST /api/head-worker/claim` atomically leases a queued job and returns `{ job, lease }` (or `job:null`); `GET /api/head-worker/:id/video` downloads its source; `POST /api/head-worker/:id/progress` accepts `{ stage }`; `POST /api/head-worker/:id/complete` accepts the GLB; `POST /api/head-worker/:id/fail` reports failure. Job routes additionally require `X-Head-Lease`.
- Leases last 90 seconds, renewed by progress every 10 seconds. Expired builds fail visibly instead of being silently rebuilt. Successful completion is idempotent and returns the same saved head when retried. Raw server videos are removed on success/failure; interrupted uploads fail and are removed during recovery. Queued videos wait for the worker. Head files remain accessible under the existing library contract.
- No keys: app still starts; video uploads show as off. Worker unavailable: the UI explains that the job is waiting for the Mac. This feature does not install dependencies or start a process on Isaac's computer remotely.

## Headset handoff QR (server -> browser)
`GET /api/handoff-qr?url=<encoded absolute XR URL>` returns a locally generated PNG QR code. Only HTTP(S) links to `/xr/` on the requesting app host are accepted; URLs with credentials or more than 2,000 characters are rejected. No external QR service receives names or head identifiers. The main onboarding always offers the direct XR link even when QR generation fails.

The main Begin flow now uses the existing head library/job APIs: name -> saved head or camera/video scan -> interview while building -> confirm -> wait for that specific job -> XR handoff. Choosing a saved head does not require the scan upload key. The automatically issued scan session remains in page memory only. No head-worker API changes.

## Secrets
All in .env, never committed. Code must start without them and say which feature is off.

## Quest pairing
POST /api/pairings with JSON {url: <same-host /xr/ URL>} returns {code, url, watchToken, viewerUrl, expiresAt}. The random four-letter code resolves via GET /api/pairings/:code to {url: <relative XR path and query>}. Codes expire after ten minutes, survive retries but not server restarts; creation/lookups are rate-limited and storage bounded. The code grants the same session access as the existing headset link; no worker or staff credentials are included.
## Live laptop mirror
Pairings now use four uppercase letters only. Creation also returns an unguessable watchToken and viewerUrl; GET /api/pairings/watch/:watchToken reports opened. Resolving the short code marks opened and adds a producer-only mirror token to the XR link. The Ready page automatically embeds viewerUrl when opened. /voice accepts {type:watch, mirror:<viewer token>} for a read-only subscriber, or start.mirror for the producer; only outgoing replies/status/facts/charts/transcripts are relayed, never microphone data. Grants expire after two hours; pairing codes after ten minutes. Laptop mirror is muted by default to avoid feedback; it reproduces the head and replies, not passthrough camera video.
