# Head build from video: implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `head/build.sh <video> <name>` turns a 24-second head-turn video into `head/builds/<name>/head.glb` (textured, five morph targets, mouth that opens) plus `report.json`.

**Architecture:** A Python package `head/uncle_head/` with one module per step. `build.sh` runs each step as its own process (pycolmap and open3d crash in one process on macOS), passing files through a work folder `head/builds/<name>/work/`. All geometry is in metres, in a right-handed frame with +y up and the face looking down +z (the template's frame after scaling).

**Tech Stack:** Python 3.11 (Homebrew), pycolmap, open3d, mediapipe (Tasks API), opencv-python-headless, numpy, scipy, Pillow, pygltflib, pytest.

**Spec:** docs/superpowers/specs/2026-11-21-head-build-design.md

## Global Constraints

- Write our own code; copy nothing from akashngb/punching-face (no licence). Follow its documented method.
- Template: MakeHuman hm08 `base.obj` from `naver/anny` `src/anny/data/mpfb2/3dobjs/base.obj` (CC0, `src/anny/data/mpfb2/LICENSE.md`). Targets from `src/anny/data/mpfb2/targets/`. Downloaded by `head/setup.sh` into `head/models/` (ignored by git's `models/` rule), never committed.
- Template units are decimetres; multiply by 0.1 on load.
- Morph target names exact: `jawOpen`, `mouthWide`, `mouthRound`, `eyeBlink_L`, `eyeBlink_R`.
- Gates (exact): at least 24 views and at least 12 with a tracked face; at least 24 registered cameras; held-out landmark reprojection median at most 4 px and 95th percentile at most 12 px.
- Scale: landmark 10 (hairline) to landmark 152 (chin) is 0.20 m.
- No people's videos or heads in git. `head/builds/`, `captures/`, `*.mp4`, `*.mov` are already ignored.
- Every step writes its timing into `report.json`; failures exit non-zero with one plain sentence saying what to re-film or retry.
- Tests: `head/.venv/bin/pytest head/tests -q`.

## Review Focus

1. A video where the face is never fully frontal (person starts at a three-quarter view): texture still picks the most frontal frame, and the report says how frontal it was.
2. A portrait phone video with rotation metadata (iPhone `.mov`): frames must come out upright before MediaPipe sees them.
3. A capture where COLMAP splits into two models: use the largest, and gate on its registered count, not the total.
4. Landmarks missing in some face frames (blink, motion blur): triangulation uses the frames that have them, and the per-landmark view count is reported.
5. A second build with the same name: overwrites cleanly, no stale work files mixed in.

---

### Task 1: Environment and template loading

**Files:**
- Create: `head/setup.sh`, `head/requirements.txt`, `head/uncle_head/__init__.py`, `head/uncle_head/template.py`, `head/tests/test_template.py`, `head/tests/conftest.py`

**Interfaces:**
- Produces: `load_head_template(models_dir) -> Template` with fields `verts (N,3) float64 metres`, `faces (M,3) int`, `uvs (N,2)` (per-vertex after splitting seams), `parts: dict[str, np.ndarray]` of face indices for `skin`, `eye_l`, `eye_r`, `teeth`, `tongue`, `hair`, and `source_index (N,)` mapping each head vertex back to its `base.obj` vertex. `load_target(models_dir, path, template) -> (N,3) float64` deltas in metres on head vertices (zeros elsewhere). `MODELS_DIR` default `head/models`.

- [ ] **Step 1:** `setup.sh`: `brew install python@3.11` if missing, create `head/.venv`, install `requirements.txt`, download `base.obj`, `LICENSE.md`, the targets listed below and the MediaPipe models (`face_landmarker.task`, `selfie_multiclass_256x256.tflite` from `storage.googleapis.com/mediapipe-models/`) into `head/models/`. Targets: `expression/units/caucasian/{mouth-open,mouth-retraction,mouth-corner-puller,mouth-pursing,mouth-protusion,eye-left-closure,eye-right-closure}.target.gz`, `macrodetails/caucasian-{male,female}-{young,old}.target.gz`. Idempotent (skips files present).
- [ ] **Step 2:** Run `bash head/setup.sh`. Expected: ends with "head setup done", and `head/.venv/bin/python -c "import pycolmap, mediapipe, cv2, scipy, pygltflib"` and, separately, `-c "import open3d"` both exit 0.
- [ ] **Step 3: Failing tests** in `test_template.py`: head vertices all have `y >= NECK_Y` (pick from the data: just below the jaw, about 1.45 m); the head is 0.20 to 0.30 m tall from chin to crown; every face in `parts["skin"]` is a triangle with valid indices; `parts` has all six keys and none empty; `load_target("expression/units/caucasian/mouth-open...")` is non-zero only on vertices below the nose and its largest delta is under 0.03 m; quads were split into two triangles each.
- [ ] **Step 4:** Implement `template.py`: parse `base.obj` groups `body`, `helper-l-eye`, `helper-r-eye`, `helper-upper-teeth`, `helper-lower-teeth`, `helper-tongue`, `helper-hair`; keep faces whose vertices are all above `NECK_Y`; split quads; split vertices on UV seams so each vertex has one UV; targets are lines `index dx dy dz` (0-based into base.obj vertices, decimetres, `#` comments).
- [ ] **Step 5:** Tests pass. Commit `head: setup script and CC0 template loader`.

### Task 2: Frames, masks and 2D landmarks

**Files:** Create `head/uncle_head/frames.py`, `head/tests/test_frames.py`

**Interfaces:**
- Produces (CLI `python -m uncle_head.frames <video> <work>`): `work/frames/NNN.png` (RGB, background set to black), `work/masks/NNN.png` (255 = head and hair), `work/frames.json` = `{"width", "height", "fps", "frames": [{"id": "NNN", "t": seconds, "sharpness": float, "landmarks": [[x_px, y_px, z_rel] x 468] | null, "yaw_deg": float | null}]}`.
- Pure helpers: `select_frames(times, sharpness, max_n=200, min_gap_s) -> list[int]`, `check_views(frames) -> None` raising `GateError` with the message "Only N usable views (need 24) ..." or "Only N views show the face (need 12) ...". `GateError` lives in `uncle_head/errors.py`.

- [ ] **Step 1: Failing tests:** `select_frames` keeps at most 200, prefers sharper frames within each time window, keeps order by time; `check_views` raises for 23 views, raises for 30 views with 11 faces, passes for 24 views with 12 faces; `yaw_from_landmarks` on a synthetic frontal set returns about 0.
- [ ] **Step 2:** Run, see them fail.
- [ ] **Step 3:** Implement. Decode with OpenCV, applying rotation metadata (`cv2.CAP_PROP_ORIENTATION_META`, rotate if needed). Sharpness = variance of the Laplacian. Segmentation: MediaPipe ImageSegmenter with the multiclass model, keep hair + body-skin + face-skin classes, then keep the largest connected component in the upper part of the frame. FaceLandmarker in IMAGE mode, one face. Yaw from the landmark-based transform matrix (`output_facial_transformation_matrixes=True`).
- [ ] **Step 4:** Tests pass, plus a run on a real capture prints the view counts. Commit `head: frame selection, masks and landmarks`.

### Task 3: Camera recovery with COLMAP

**Files:** Create `head/uncle_head/cameras.py`, `head/tests/test_cameras.py`

**Interfaces:**
- Consumes: `work/frames/`, `work/masks/`, `work/frames.json`.
- Produces (CLI `python -m uncle_head.cameras <work>`): `work/cameras.json` = `{"model": "SIMPLE_RADIAL", "K": 3x3, "dist": [k1], "views": {"NNN": {"R": 3x3, "t": [3]}}}` with world-to-camera `x_cam = R @ X + t` in COLMAP's world frame; the frames it couldn't register are absent.
- Pure helpers: `largest_model(reconstructions) -> Reconstruction`, `focal_prior_px(width, height, hfov_deg=69.0) -> float`, `check_registered(n) -> None` (raises `GateError` under 24).

- [ ] **Step 1: Failing tests:** `focal_prior_px(1920, 1080)` equals `960 / tan(34.5 deg)` to 1e-6; `check_registered(23)` raises, `(24)` passes; `largest_model` picks the one with more registered images; `cameras.json` round-trip (write then read) preserves R, t and K.
- [ ] **Step 2:** Run, see them fail.
- [ ] **Step 3:** Implement with pycolmap: `extract_features` (SIFT, `max_num_features=8192`, `peak_threshold` lowered to 0.004, masks from `work/masks/` so background features are ignored, single camera with the focal prior), `match_sequential` (overlap 10, loop detection off), `incremental_mapping`; if the largest model has under 24 images, `match_exhaustive` and map again. Try the default mapper options first; record which path succeeded in the report.
- [ ] **Step 4:** Tests pass; on a real capture the registered count is printed. Commit `head: camera recovery with pycolmap`.

### Task 4: Triangulated 3D landmarks

**Files:** Create `head/uncle_head/landmarks3d.py`, `head/tests/test_landmarks3d.py`

**Interfaces:**
- Consumes: `frames.json` landmarks, `cameras.json`.
- Produces (CLI `python -m uncle_head.landmarks3d <work>`): `work/landmarks3d.json` = `{"points": [[x,y,z] x 468] metres in head frame, "views_per_point": [int x 468], "heldout_px": {"median", "p95"}, "to_head": 4x4}`. Head frame: origin at the midpoint of landmarks 234 and 454 (ears side), +y from chin (152) to forehead (10), +z out of the nose (1), scaled so |p10 - p152| = 0.20 m.
- Pure helpers: `triangulate_point(Ps: list[3x4], xs: list[2]) -> (3,)` with RANSAC over views (inlier 4 px) then least squares; `reprojection_errors(points, Ps, xs) -> array`; `check_reprojection(median, p95)` raises `GateError` above 4 / 12 px.

- [ ] **Step 1: Failing tests:** 10 synthetic cameras on a circle around a known point set recover it to 1e-6 with no noise and to under 2 mm with 1 px noise plus one 50 px outlier view; `check_reprojection(4.0, 12.0)` passes and `(4.1, 5)` and `(3, 12.5)` raise; the head-frame transform puts p10 - p152 at length 0.20 and along +y.
- [ ] **Step 2:** Run, see them fail.
- [ ] **Step 3:** Implement; every 5th face view is held out of triangulation and only used for `heldout_px`.
- [ ] **Step 4:** Tests pass. Commit `head: triangulate landmarks with held-out check`.

### Task 5: Template anchors (one-time) and the warp

**Files:** Create `head/uncle_head/render.py` (numpy z-buffer rasteriser), `head/uncle_head/anchors.py`, `head/uncle_head/fit.py`, tests `head/tests/test_render.py`, `head/tests/test_fit.py`. Output committed: `head/template/anchors.json` (indices and barycentric weights only, no mesh data).

**Interfaces:**
- `render(verts, faces, K, R, t, size) -> (rgb uint8 HxWx3, face_id int HxW (-1 empty), bary HxWx3)` with Lambert shading.
- `make_anchors(template, models_dir) -> {"landmark": [i], "face": [f], "bary": [[a,b,c]]}`: render the template front-on at 1024 px, run FaceLandmarker on the render, look up each landmark pixel in `face_id`/`bary`. CLI `python -m uncle_head.anchors` writes `head/template/anchors.json`.
- `warp_template(template, anchors, points_head) -> (verts_warped, warp_fn)` where `warp_fn(X (K,3)) -> (K,3)`; thin-plate RBF (`scipy.interpolate.RBFInterpolator`, kernel `thin_plate_spline`) on displacements, `smoothing` chosen from `[0, 1e-4, 1e-3, 1e-2]` as the smallest whose max edge-length change ratio stays under 1.5.

- [ ] **Step 1: Failing tests:** render of a unit cube front-on has `face_id` set in the centre and -1 in the corners, barycentrics sum to 1; `warp_template` with targets equal to the anchors' current positions returns the same vertices (to 1e-9); with targets moved by a constant offset, every vertex moves by that offset (to 1e-6); anchors land within 1 mm of their targets with smoothing 0.
- [ ] **Step 2:** Run, see them fail.
- [ ] **Step 3:** Implement. If FaceLandmarker finds no face on the plain grey render, retry with a skin-tone fill and eye helpers drawn darker; if it still fails, stop and tell Isaac (fallback: about 40 hand-picked anchors, a separate decision).
- [ ] **Step 4:** Run `python -m uncle_head.anchors`, check at least 400 of 468 landmarks anchored; save a debug render with the landmarks drawn to `head/builds/_debug/anchors.png` and look at it.
- [ ] **Step 5:** Tests pass. Commit `head: template anchors and thin-plate warp`.

### Task 6: Hair envelope

**Files:** Create `head/uncle_head/hair.py`, `head/tests/test_hair.py`

**Interfaces:**
- `fit_hair(hair_verts, cams, masks, to_head) -> hair_verts` : push each hair-cap vertex out or in along its normal (bounded 0 to 0.04 m outwards, smoothed over neighbours) until its projections fall inside the masks in at least 80% of the views that see it.

- [ ] **Step 1: Failing test:** a sphere of radius 0.10 inside a synthetic mask set of a 0.12 sphere seen from 12 cameras grows to 0.12 within 5 mm, and never past the 0.04 m bound.
- [ ] **Step 2:** Run, see it fail. **Step 3:** Implement. **Step 4:** Pass. Commit `head: hair envelope from silhouettes`.

### Task 7: Texture

**Files:** Create `head/uncle_head/texture.py`, `head/tests/test_texture.py`

**Interfaces:**
- `bake_texture(verts, faces, uvs, views, size=2048) -> (texture uint8 HxWx3, report dict)` where `views` is a list of `{image, K, R, t}` in the head frame. For each texel: its 3D point and normal from the UV rasterisation; the best view is the frontal frame (smallest |yaw|) if it sees the point with normal-to-camera angle under 60 degrees, otherwise the view with the best angle; visibility by a depth test against that view's depth map from `render`; colours blended across the two best views over a 10-degree band; per-view exposure gain matched to the frontal view on shared texels. Unseen texels: mean skin colour (skin part) or mean hair colour (hair part). Report: frontal frame id and its yaw, percent texels seen.

- [ ] **Step 1: Failing tests:** a two-triangle quad facing a synthetic camera that sees a red image comes out red; a quad hidden behind another quad gets the fallback colour, not red; exposure gain of 2x between two views is corrected to within 5%.
- [ ] **Step 2:** Run, see them fail. **Step 3:** Implement. **Step 4:** Pass. Commit `head: texture bake from views`.

### Task 8: Rig (mouth and morph targets)

**Files:** Create `head/uncle_head/rig.py`, `head/tests/test_rig.py`

**Interfaces:**
- `build_morphs(template, warp_fn, models_dir) -> dict[str, (N,3)]` with the five names. Weights: `jawOpen` = mouth-open; `mouthWide` = 0.7 mouth-retraction + 0.3 mouth-corner-puller; `mouthRound` = 0.7 mouth-pursing + 0.3 mouth-protusion; `eyeBlink_L` = eye-left-closure; `eyeBlink_R` = eye-right-closure. Each morph = `warp_fn(base + delta) - warp_fn(base)`. Note MakeHuman "left" is the character's left; check against the render that `eyeBlink_L` closes the eye on the viewer's right when facing the head, and swap if not.
- `mouth_parts(template) -> materials`: teeth light grey, tongue dark red-brown, mouth interior faces dark (near Ink) so the open mouth reads as a cavity. If the `body` group's lips are sealed (no hole between upper and lower lip vertex rings), remove the faces crossing the inner-lip line from the warped landmarks (13 upper inner, 14 lower inner, 78/308 corners).

- [ ] **Step 1: Failing tests:** all five morphs present with shape (N,3); each morph is non-zero only within 0.08 m of its region's centre (mouth or that eye); `jawOpen` moves the chin vertex down (negative y) by 5 to 30 mm; the mouth has a hole: rays from in front of the face through the mid-lip point hit tongue or teeth, not skin, with `jawOpen` at 1.
- [ ] **Step 2:** Run, see them fail. **Step 3:** Implement. **Step 4:** Pass. Commit `head: mouth and five morph targets`.

### Task 9: Export and build script

**Files:** Create `head/uncle_head/export.py`, `head/build.sh`, `head/tests/test_export.py`; modify `head/README.md`.

**Interfaces:**
- `export_glb(path, parts: list[{verts, faces, uvs, texture | color}], morphs: dict[str,(N,3)] applied to the skin part) -> None` via pygltflib: one mesh with primitives per part, morph targets on the skin primitive with `mesh.extras.targetNames` set to the names (three.js reads this into `morphTargetDictionary`), PNG texture embedded.
- `build.sh <video> <name>`: clears `head/builds/<name>/work`, runs frames, cameras, landmarks3d, then a `python -m uncle_head.assemble <work> <out>` that does fit, hair, texture, rig, export, and writes `report.json` with seconds per step, view counts, registered cameras, held-out px, frontal yaw, percent texels seen.

- [ ] **Step 1: Failing tests:** an exported glb loaded back with pygltflib has `extras.targetNames` equal to the five names, morph accessor counts equal the skin vertex count, one embedded image.
- [ ] **Step 2:** Run, see them fail. **Step 3:** Implement `export.py`, `assemble.py` and `build.sh`. **Step 4:** Pass.
- [ ] **Step 5: End to end** on a real capture in `captures/`: `bash head/build.sh captures/<file> <name>` succeeds; `report.json` numbers recorded; start `npm start`, open `http://localhost:3000/xr/?head=<name>`, run the UI verify loop (state the expectation, screenshot at 1440x900 and 390x844, mouth moving with the sample greeting, console clean).
- [ ] **Step 6:** README: how to film, how to build, what each gate failure means. Commit `head: export, build script and README`.

Later list: aging (skin model, grey hair, young/old shape targets), copying heads to the live server (ask Ethan), the MediaPipe-pose fallback if COLMAP won't register real captures, speed work toward 2 minutes.
