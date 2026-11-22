# head/: building and aging the 3D head

Owner: Person 3. Spec: PLAN.md Part 3 (building and aging). Contracts: head files out (CONTRACTS.md).

Lives here: frame picking and MediaPipe segmentation, COLMAP camera recovery, landmark triangulation, fitting the MakeHuman head template and hair shape, painting the texture, the face-aging step (run on the Vultr GPU), grey hair, age shape changes, the prepared aged skin versions, and saving finished heads.

Uses multi-view photogrammetry and template fitting. People's videos and heads stay out of git (.gitignore).

## Blend shapes the XR app drives

Every `head.glb` needs these morph targets (names exact): `jawOpen`, `mouthWide`, `mouthRound`, `eyeBlink_L`, `eyeBlink_R`. ARKit names (`mouthStretch_L/R`, `mouthFunnel`) also work. See `xr/head.js`.

## Building a head

One time: `bash head/setup.sh` (Homebrew Python 3.11, packages in `head/.venv`, the CC0 MakeHuman template and MediaPipe models in `head/models/`; none of it goes in git).

Film: a phone on a stand at head height, about 1 m away, even light. The person starts facing the camera with a neutral face, turns slowly all the way round (about 20 seconds), and ends facing the camera again. Keep the mouth closed. Use the original file from the phone (AirDrop "Options > All Photos Data" or a cable), not one shrunk by a chat app.

Build: `head/build.sh captures/<video> <name>` writes `head/builds/<name>/head.glb` and `report.json`, then open `/xr/?head=<name>`. About 100 s on an M5 Mac.

| Message | What to do |
|---|---|
| Only N usable views / Only N views show the face | Film again: slower, the whole turn, start and end facing the camera |
| Only N frames could be placed | Film again in even light, closer, turning slowly |
| Face points don't line up between frames | Film again with a still, neutral face |

How it works (PLAN.md Part 3): MediaPipe masks and face landmarks per frame, COLMAP cameras (exhaustive matching closes the loop of the turn), landmarks triangulated with a held-out check, the template warped onto them (thin-plate RBF), the scalp pushed out to the outlines for hair, a texture baked from about 40 views, and the five mouth and eye shapes from MakeHuman's CC0 expression units carried through the same warp. Tests: `head/.venv/bin/pytest head/tests` (from `head/`: `.venv/bin/pytest`).
