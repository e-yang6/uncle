# xr/: the WebXR app in the headset

Owner: Person 3. Spec: PLAN.md Part 3 (showing it). Follow DESIGN-RULES.md.

Lives here: the three.js WebXR app for the Meta Quest browser with passthrough, the mirror frame, loading a head, opening the mouth and driving it from the audio, blinking and small head movements, blending aged skin versions, the sliders with hand tracking (controllers as backup), and the theme file from the design rounds.

## Running it

- Open `/xr/` on the live link (once the server serves it) or locally: from the repo root, `python3 -m http.server 8123`, then http://127.0.0.1:8123/xr/.
- Quest browser: "Start in the headset" enters passthrough AR; the mirror appears about 1 m in front of where you're looking.
- Laptop: "Start" plays in the page (for casting and screenshots).
- `?head=<name>` loads `/head/builds/<name>/head.glb` (CONTRACTS.md). Without it, a stand-in head loads from the three.js sample files (dev only; its licence isn't confirmed, so it's never committed or shown to judges as ours).
- `?voice=live` uses the `/voice` socket (CONTRACTS.md) and the microphone (Jeffrey's `/mic.js`, started after Start; the browser asks for permission). Default is `sample/greeting.json`, a Mac `say` line packed as contract reply messages. Rebuild it with `xr/sample/make-sample.sh`.
- Tests: `node --test xr/` (mouth analysis, PCM decoding, the queue start-time rule).

## Files

- `mouth.js`: audio frame -> jaw / wide / round (loudness and zero-crossing rate), plus smoothing.
- `pcm.js`: base64 16-bit PCM -> floats. `player.js`: gapless Web Audio queue with an analyser.
- `voice.js`: sample and live sources of contract messages. `head.js`: loading a head, blend shapes, blinking and sway.
- `main.js`, `index.html`, `theme.css`: the scene, mirror frame, Start button and caption (DESIGN-RULES.md).
