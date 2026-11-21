# Thin version: a saved head in AR, mouth moving from audio (xr/)

Approved by Isaac in chat, Sat 2026-11-21 ~01:40. BUILD.md step "Saved head in AR, mouth moving from audio".

## Intent
The thin version (hours 0 to 4) needs a head talking in the headset on the live link. This piece is the headset page: a head in a thin mirror frame, mouth driven by audio arriving in the CONTRACTS.md voice format. The real head pipeline and the real voice socket aren't ready, so both are stood in, behind the same interfaces the real ones will use.

## Goals
- Quest browser: "Start" enters immersive-ar with passthrough; the head sits in a mirror frame about 1 m in front, at seated head height.
- Laptop: the same scene in the page (for casting and Playwright checks).
- Mouth from audio as it plays: loudness opens the jaw; bright (high-frequency) sound widens, dark sound rounds.
- Audio arrives as CONTRACTS.md `reply` messages (base64 16-bit LE mono PCM, 24 kHz), queued back to back without gaps.
- Blinking and small head movement.

## Non-goals
Sliders, aging, mic input, the real head build, the real `/voice` socket (a stub that speaks the contract is included, off by default).

## Approaches considered
1. **three.js from a pinned CDN, no build step (picked).** Nothing to build on deploy; deploy.sh unchanged.
2. three.js with Vite bundling. Needs a build script in the shared package.json; slower to iterate.
3. A-Frame. Higher level, but harder to control morph targets and look.

## Decisions
- Stand-in head: three.js's `facecap.glb` sample (Face Cap by Bannaflak, ARKit blend shapes incl. `jawOpen`, `mouthFunnel`, `mouthStretch_*`, `eyeBlink_*`), loaded from the jsDelivr copy of the three.js repo at runtime, not committed. Asset licence not confirmed, so it is a dev stand-in only; real heads replace it.
- Real heads: `/head/builds/<name>/head.glb` via `?head=<name>`. Blend shape names our head build must provide: `jawOpen`, `mouthWide` (or `mouthStretch_L/R`), `mouthRound` (or `mouthFunnel`), `eyeBlink_L`, `eyeBlink_R`.
- Mouth analysis: RMS (dBFS mapped -45..-6 dB to 0..1) for the jaw, zero-crossing rate (300..2500 Hz) as brightness. Fast attack, slower release smoothing. Pure functions, unit tested.
- Sample audio: a short line made with macOS `say`, packed as contract `reply` messages in `xr/sample/greeting.json`. No numbers in it, no real person's voice.
- Look: DESIGN-RULES.md. Ink background on laptop, transparent in AR; frame is a thin Dusk grey line; IBM Plex Sans; 4 px corners; no shadows.

## Left to the builder
Exact frame size, head scale, light setup, copy for the status line.
