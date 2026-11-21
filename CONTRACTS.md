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
The headset connects via WebSocket at `wss://<host>/voice`. One socket per session. Messages:
- Client sends: `{ "type": "audio", "data": "<base64 PCM>" }` (mic input for speech-to-text)
- Client sends: `{ "type": "text", "question": "..." }` (typed or confirmed question)
- Server sends: `{ "type": "transcript", "text": "..." }` (what the user said)
- Server sends: `{ "type": "reply", "sentence": "...", "audio": "<base64 PCM>", "done": false }` (streamed sentence by sentence; `done: true` on the last one)

## Head files (head -> xr)
One glTF binary (.glb) per head in `head/builds/<name>/head.glb`. The XR app loads by name. The .glb includes the mesh, texture, and blend shapes for mouth animation. Aged skin variants sit alongside as `head_age<N>.glb` (e.g. `head_age65.glb`, `head_age75.glb`) for slider blending.

## Secrets
All in .env, never committed. Code must start without them and say which feature is off.
