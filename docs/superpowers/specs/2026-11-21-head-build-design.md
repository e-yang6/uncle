# Head build from a 24-second video (head/)

Status: draft for Isaac's approval. BUILD.md step "Live head build from a 24-second video" (hours 4 to 12). Spec: PLAN.md Part 3 "Building the head".

## Intent
Turn a phone video of a person slowly turning all the way round (neutral face) into `head/builds/<name>/head.glb` that the headset page already loads (`/xr/?head=<name>`), recognisably them, with a mouth that opens. Isaac's call (2026-11-21): follow the multi-view pipeline in PLAN.md, COLMAP included. Judges are pre-scanned, so a slow build is acceptable; correctness first, then speed.

## Goals
- One command: `head/build.sh <video> <name>` produces `head.glb` plus `report.json` (per-step time, frames kept, cameras registered, landmark reprojection error).
- The .glb has morph targets `jawOpen`, `mouthWide`, `mouthRound`, `eyeBlink_L`, `eyeBlink_R` (contract in head/README.md), a mouth that opens, and a dark mouth interior.
- Clear failure messages at each gate (too few views, cameras didn't register, reprojection too high), so a bad capture is re-filmed instead of debugged.

## Non-goals (this piece)
Aging (skin, grey hair, shape: hours 12 to 20, but this design keeps the hooks), the paid AI hair step, glasses, ear pinning, the back-of-head harmonic fill, speed work below "it finishes".

## Anti-goals
- Copying third-party code or processed assets without an appropriate licence. Implement the pipeline using documented photogrammetry techniques.
- People's videos or heads in git (`head/builds/`, `captures/`, `*.mp4`, `*.mov` are already ignored).

## Approaches considered
1. **COLMAP multi-view, as PLAN.md specifies (picked by Isaac).** Most accurate shape; riskiest step is camera registration.
2. MediaPipe per-frame head pose instead of COLMAP. Faster, safer, less accurate. Kept as the fallback if COLMAP won't register on real captures.
3. Single frontal photo on a warped template. Fastest, weakest profile shape.

## The method (each step its own process; pycolmap and open3d crash in one process on macOS)
1. **Frames** (`head/frames.py`): decode with OpenCV, keep up to 200 sharp frames spread over the turn. MediaPipe selfie multiclass segmentation masks the background (person = hair + skin + face). MediaPipe FaceLandmarker gives the 468 landmarks and a yaw estimate where the face is visible. Gate: at least 24 views, at least 12 with a tracked face.
2. **Cameras** (`head/cameras.py`): pycolmap on the masked frames. SIFT up to 8192 features with a low peak threshold, one shared camera with a focal length prior from the phone's field of view, sequential matching with exhaustive fallback, incremental mapping. Gate: at least 24 registered views.
3. **3D landmarks** (`head/landmarks3d.py`): turn each face frame's landmarks into rays from its camera and triangulate each of the 468 points robustly (RANSAC over views, then least squares). Every 5th face view is held out. Gate: held-out reprojection median at most 4 px and 95th percentile at most 12 px. Scale: hairline (landmark 10) to chin (152) is 20 cm.
4. **Template fit** (`head/fit.py`): the CC0 MakeHuman hm08 base mesh from `naver/anny` (`src/anny/data/mpfb2/3dobjs/base.obj`, licence `src/anny/data/mpfb2/LICENSE.md`, CC0), cut to head and neck. Template-to-landmark correspondences are made once by rendering the template front-on, running FaceLandmarker on the render and ray-casting the landmarks onto the mesh (saved as `head/template/anchors.json`). Fallback: hand-picked anchors for about 40 points. A smooth thin-plate RBF warp (SciPy) moves the template onto the triangulated landmarks, with a smoothing sweep that keeps the result smooth. A smooth hair envelope is fitted to the masked silhouettes from the registered cameras.
5. **Texture** (`head/texture.py`): use the template's own UVs. Project the most frontal frame onto the face. Blend side views in by which camera sees each texel best, with a depth test for visibility. Match exposure between views. Unseen areas get the average skin or hair colour.
6. **Mouth and expressions** (`head/rig.py`): open the mouth by removing the triangles that seal the lips (found from the warped inner-lip landmarks), and add a dark mouth-cavity mesh behind them. Morph targets come from the CC0 MakeHuman expression units in the same data (`targets/expression/units/`): `mouth-open` gives `jawOpen`, `mouth-retraction` (with `mouth-corner-puller`) gives `mouthWide`, `mouth-pursing` (with `mouth-protusion`) gives `mouthRound`, and `eye-left-closure` and `eye-right-closure` give the blinks. Each target is carried through the same warp: target = warp(base + delta) - warp(base).
7. **Export** (`head/export.py`): glTF binary with the mesh, texture and the five morph targets (pygltflib; trimesh doesn't write morph targets).

Hook for aging later: the same data has young and old body targets (`targets/macrodetails/*-young`, `*-old`), which give the "template at their age vs at 70" shape change PLAN.md asks for, through the same warp.

## Environment
Python 3.11 from Homebrew in `head/.venv` (already ignored by git). open3d has no Python 3.9 wheel for Apple Silicon, so the system Python 3.9 won't do. Packages: pycolmap, open3d, mediapipe, opencv-python-headless, numpy, scipy, trimesh, Pillow, pygltflib, pytest. MediaPipe models are downloaded by a setup script (not committed). Installing needs Isaac's OK (Homebrew Python, about 1 GB of packages).

## Proof
- Unit tests (pytest, `head/tests/`): triangulation recovers known points from synthetic cameras; the RBF warp lands anchors on targets; morph targets survive export with the right names; the lip cut opens the mouth without holes elsewhere.
- End to end on a real capture of a teammate: `report.json` numbers, then the head in `/xr/?head=<name>` with screenshots, and in the Quest.
- PLAN.md's "under 2 minutes" is measured and reported as it is; not a gate for this piece.

## Open items
- Who films and on what: assumed a phone, video moved to this Mac, built here.
- Getting heads onto the live server: `head/builds/` is ignored by git, so a built head has to be copied up (`scp`). The server is Ethan's; ask him for a way to do it (a script, or he copies).
- Phone field of view for the focal prior: read from the video's metadata if present, otherwise a typical phone main camera value, measured once.

## Left to the builder
Frame selection details, RANSAC thresholds, smoothing values, texture size (2048 square to start), how much of the neck to keep.
