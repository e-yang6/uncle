# Plan: thin head in AR (xr/)

Spec: docs/superpowers/specs/2026-11-21-xr-thin-head-design.md. Execution: inline by Isaac's agent (credits are tight, JOBS.md), one fresh reviewer at the end.

1. **`xr/pcm.js`**: `decodePcm16(base64) -> Float32Array` in -1..1. Test: known bytes decode to known samples (`xr/pcm.test.js`).
2. **`xr/mouth.js`**: `analyzeFrame(samples, sampleRate) -> {level, brightness}`, `mouthShape(frame) -> {jaw, wide, round}`, `createSmoother({attack, release})`. Tests: silence closes; loud low tone opens and rounds; loud high tone opens and widens; quiet opens less; smoother rises faster than it falls.
3. **`xr/player.js`**: `nextStartTime(now, queuedUntil)` (pure, tested: gapless when queued, never in the past) and `createPlayer()` (Web Audio queue through an AnalyserNode, `onSentence` callback).
4. **`xr/voice.js`**: `sampleVoice(url)` replays `xr/sample/greeting.json`; `liveVoice(wsUrl, start)` speaks the CONTRACTS.md socket. Both call `onMessage(msg)`.
5. **`xr/sample/greeting.json`**: made by `xr/sample/make-sample.sh` (macOS `say` + `afconvert`).
6. **`xr/head.js`**: load a glb, find the morph-target mesh, map blend shape names, `apply({jaw, wide, round, blink})`; blink timer and head sway.
7. **`xr/index.html` + `xr/main.js` + `xr/theme.css`**: scene, mirror frame, Start button, AR session, caption line.
8. **Verify loop** (UI-WORKFLOW): expectation stated, Playwright screenshots at 1440x900 and 390x844, before Start and while speaking (mouth open), console clean. `node --test xr/` passes.
9. Review by a fresh subagent; fix P0/P1. Log in BUILD.md, README notes, commit, push, board post.

Later list: sliders, aged skin blending, mic input, real head build, theme file from design rounds.
