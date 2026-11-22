# xr/: the WebXR app in the headset

Owner: Person 3. Spec: PLAN.md Part 3 (showing it). Follow DESIGN-RULES.md.

Lives here: the three.js WebXR app for the Meta Quest browser with passthrough, the mirror frame, loading a head, opening the mouth and driving it from the audio, blinking and small head movements, blending aged skin versions, the sliders with Quest controllers (hand tracking optional), and the theme file from the design rounds.

## Running it

- Open `/xr/` on the live link (once the server serves it) or locally: from the repo root, `python3 -m http.server 8123`, then http://127.0.0.1:8123/xr/.
- Quest browser: "Start in the headset" enters passthrough AR; the mirror appears about 1 m in front of where you're looking.
- Laptop: "Start" plays in the page (for casting and screenshots).
- `?head=<name>` loads `/head/builds/<name>/head.glb` (CONTRACTS.md). Without it, a stand-in head loads from the three.js sample files (dev only; its licence isn't confirmed, so it's never committed or shown to judges as ours).
- `?age=<n>` sets the apparent age for the head's look (default 70; 25 or under shows the scan unchanged). In the page, `window.uncle.debug.setAge(n)` changes it live; `debug.showChart({kind, title, labels, datasets})` shows a chart panel; `debug.showCaption3d(true)` shows the headset caption on the laptop.
- `?voice=live` uses the `/voice` socket (CONTRACTS.md) and the microphone (Jeffrey's `/mic.js`, started after Start; the browser asks for permission). Default is `sample/greeting.json`, a Mac `say` line packed as contract reply messages. Rebuild it with `xr/sample/make-sample.sh`.
- Tests: `node --test "xr/**/*.test.js"` (mouth analysis, PCM decoding, the queue start-time rule, gaze). `node --test xr/` doesn't work on Node 24.

## Files

- `mouth.js`: audio frame -> jaw / wide / round (loudness and zero-crossing rate), plus smoothing.
- `pcm.js`: base64 16-bit PCM -> floats. `player.js`: gapless Web Audio queue with an analyser.
- `voice.js`: sample and live sources of contract messages. `head.js`: loading a head, blend shapes, blinking and sway, glossy and toned-down eyes that turn to look at the viewer, and the neck fading out instead of ending on a jagged cut.
- `gaze.js`: where the eyes point: follows the viewer with a short lag, small saccades every 1 to 3 s, at most 28 degrees off straight ahead. In the page, `window.uncle.debug.gazeAt = [x, y, z]` makes the eyes look at a world point (for checks).
- `main.js`, `index.html`, `theme.css`: the scene, mirror frame, Start button and caption (DESIGN-RULES.md).
- `age.js` + the skin shader hook in `head.js`: aging in the headset from one apparent age, on any saved head (no rebuild). A face frame from the two eyeball centres places the zones: grey hair (hair zone and darker than the cheek tone measured from the texture; the crown always), skin (less colour, sallow, faint spots, lines from nose to mouth, crow's feet, forehead lines, under-eye shadow), shape (jowls drop, lips thin; from rest positions so the mouth still moves). The amounts are a look tuned by eye, never spoken.
- `caption3d.js` + `wrap.js`: caption and status drawn under the mirror in the headset, because the Quest browser doesn't show the dom-overlay panel in passthrough AR.
- `charts.js`, `chartpanel.js`, `fade.js`: the server's `chart` messages drawn on a panel beside the mirror, in the style on `/xr/chart-styles.html` (kinds line, bar, range from CONTRACTS.md, plus the proposed snapshot, chance, milestones, timeline; see `CHARTS.md`); it fades after 20 s, and a controller trigger or hand pinch on it picks it up, and it stays where it's let go.

## Chart style to aim for (Isaac, Sat Nov 21)

Isaac wants the wealth and money charts to take inspiration from ProjectionLab's phone app (screenshots kept outside git, third-party UI). Restyle in DESIGN-RULES colours (Ink, Paper, Dusk, one amber accent), don't copy its look:
- One big headline number, with a single stacked bar under it showing what the money is made of (TFSA / RRSP / other) and a legend with percentages.
- Net worth over a lifetime as a smooth curve with a soft fill under it and almost no axes; only 2 or 3 labelled milestone dots (at retirement, left at 90 with a dashed marker).
- Milestones with "in N years" labels, and a life timeline bar coloured by phase (now, saving, retired) with dots at the milestones.
Every number still comes from the simulation. Now built: `chart-styles.html` (the style page, drawn from a real sample run made by `sample/make-charts.mjs`) and `CHARTS.md` (which charts, from which data). `TO-TEST.md` lists what nobody has tested yet.

Main handoff now opens a muted, read-only laptop head/reply mirror automatically when Quest uses the pairing code (keep Ready open on the laptop). The mirror does not request a microphone or create a second conversation. Enable laptop sound explicitly if needed. The head is 1.65 times its previous size, with no backing plane or border; passthrough remains transparent.
