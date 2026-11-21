"""Step 2: recover each frame's camera with COLMAP (pycolmap), on the masked frames.

CLI: python -m uncle_head.cameras <work>
Writes work/cameras.json: K, distortion and, per registered frame, world-to-camera R, t
(x_cam = R @ X + t). Frames COLMAP couldn't place are left out.

The person turns in front of a still phone; with the background masked out, that is the
same as the camera orbiting a still head.
"""
from __future__ import annotations

import json
import math
import shutil
import sys
from pathlib import Path

import numpy as np

from .errors import GateError

MIN_REGISTERED = 24
PHONE_HFOV_DEG = 69.0  # typical phone main camera across the long side (assumption, see report)


def focal_prior_px(width, height, hfov_deg=PHONE_HFOV_DEG) -> float:
    return (max(width, height) / 2) / math.tan(math.radians(hfov_deg / 2))


def check_registered(n) -> None:
    if n < MIN_REGISTERED:
        raise GateError(f"Only {n} frames could be placed (need {MIN_REGISTERED}). Film again in even light, closer to the camera, turning slowly.")


def largest_model(models):
    return max(models.values(), key=lambda m: m.num_reg_images(), default=None)


def write_cameras(path, K, dist, views, matching) -> None:
    data = {
        "model": "SIMPLE_RADIAL",
        "K": np.asarray(K).tolist(),
        "dist": list(dist),
        "matching": matching,
        "views": {k: {"R": np.asarray(R).tolist(), "t": np.asarray(t).tolist()} for k, (R, t) in views.items()},
    }
    Path(path).write_text(json.dumps(data))


def read_cameras(path):
    data = json.loads(Path(path).read_text())
    views = {k: (np.array(v["R"]), np.array(v["t"])) for k, v in data["views"].items()}
    return np.array(data["K"]), data["dist"], views


def _map(pycolmap, db, images, out, matching):
    if out.exists():
        shutil.rmtree(out)
    out.mkdir(parents=True)
    if matching == "sequential":
        pairing = pycolmap.SequentialPairingOptions()
        pairing.overlap = 10
        pairing.loop_detection = False
        pycolmap.match_sequential(db, pairing_options=pairing)
    else:
        pycolmap.match_exhaustive(db)
    return pycolmap.incremental_mapping(db, images, out)


def run(work) -> dict:
    import pycolmap

    work = Path(work)
    info = json.loads((work / "frames.json").read_text())
    images = work / "frames"
    col = work / "colmap"
    if col.exists():
        shutil.rmtree(col)
    masks = col / "masks"
    masks.mkdir(parents=True)
    for f in info["frames"]:  # COLMAP looks for <image name>.png; black = ignore
        shutil.copy(work / "masks" / f"{f['id']}.png", masks / f"{f['id']}.png.png")

    w, h = info["width"], info["height"]
    f0 = focal_prior_px(w, h)
    reader = pycolmap.ImageReaderOptions()
    reader.camera_model = "SIMPLE_RADIAL"
    reader.camera_params = f"{f0},{w / 2},{h / 2},0"
    reader.mask_path = str(masks)
    extraction = pycolmap.FeatureExtractionOptions()
    extraction.sift.max_num_features = 8192
    extraction.sift.peak_threshold = 0.004
    db = col / "database.db"
    pycolmap.extract_features(db, images, camera_mode=pycolmap.CameraMode.SINGLE, reader_options=reader, extraction_options=extraction)

    matching = "sequential"
    model = largest_model(_map(pycolmap, db, images, col / "sparse", matching))
    if model is None or model.num_reg_images() < MIN_REGISTERED:
        matching = "exhaustive"
        model = largest_model(_map(pycolmap, db, images, col / "sparse", matching))
    n = model.num_reg_images() if model else 0
    check_registered(n)

    cam = next(iter(model.cameras.values()))
    fpx, cx, cy, k1 = cam.params
    K = np.array([[fpx, 0, cx], [0, fpx, cy], [0, 0, 1]])
    views = {}
    for img in model.images.values():
        if not img.has_pose:
            continue
        pose = img.cam_from_world()
        views[Path(img.name).stem] = (pose.rotation.matrix(), np.asarray(pose.translation))
    write_cameras(work / "cameras.json", K, [float(k1)], views, matching)
    return {"registered": n, "of": len(info["frames"]), "matching": matching, "focal_px": float(fpx), "focal_prior_px": f0, "points": model.num_points3D()}


if __name__ == "__main__":
    try:
        r = run(sys.argv[1])
    except GateError as e:
        print(e, file=sys.stderr)
        sys.exit(2)
    print(f"cameras: placed {r['registered']} of {r['of']} frames ({r['matching']} matching), focal {r['focal_px']:.0f} px (prior {r['focal_prior_px']:.0f})")
    Path(sys.argv[1], "cameras_report.json").write_text(json.dumps(r))
