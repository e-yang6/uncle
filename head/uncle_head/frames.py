"""Step 1: pick sharp frames from the video, mask the head, find the 468 face landmarks.

CLI: python -m uncle_head.frames <video> <work>
Writes work/frames/NNN.png (background black), work/masks/NNN.png (255 = head, hair, neck)
and work/frames.json.
"""
from __future__ import annotations

import json
import sys
from pathlib import Path

import cv2
import numpy as np

from .errors import GateError

MODELS = Path(__file__).resolve().parents[1] / "models"
MAX_FRAMES = 200
MAX_SIDE = 1280  # saved frames are at most this long, to keep COLMAP quick
MIN_VIEWS = 24
MIN_FACE_VIEWS = 12
KEEP_CLASSES = (1, 2, 3)  # selfie multiclass: hair, body-skin, face-skin


def select_frames(times, sharpness, max_n=MAX_FRAMES) -> list[int]:
    """The sharpest frame in each of max_n equal time windows, in time order."""
    times = np.asarray(times, float)
    sharpness = np.asarray(sharpness, float)
    if len(times) <= max_n:
        return list(range(len(times)))
    edges = np.linspace(times[0], times[-1], max_n + 1)
    window = np.clip(np.searchsorted(edges, times, side="right") - 1, 0, max_n - 1)
    keep = []
    for w in range(max_n):
        idx = np.flatnonzero(window == w)
        if len(idx):
            keep.append(int(idx[np.argmax(sharpness[idx])]))
    return sorted(keep)


def check_views(frames) -> None:
    n = len(frames)
    faces = sum(1 for f in frames if f.get("landmarks"))
    if n < MIN_VIEWS:
        raise GateError(f"Only {n} usable views (need {MIN_VIEWS}). Film the full turn more slowly, in even light.")
    if faces < MIN_FACE_VIEWS:
        raise GateError(f"Only {faces} views show the face (need {MIN_FACE_VIEWS}). Start and end the turn facing the camera, and turn more slowly past the front.")


def yaw_from_matrix(m) -> float:
    """Head yaw in degrees from MediaPipe's facial transformation matrix (0 = facing the camera)."""
    r = np.asarray(m)[:3, :3]
    return float(np.degrees(np.arctan2(r[0, 2], r[2, 2])))


def _upright(frame, rotation):
    turns = {90: cv2.ROTATE_90_CLOCKWISE, 180: cv2.ROTATE_180, 270: cv2.ROTATE_90_COUNTERCLOCKWISE}
    return cv2.rotate(frame, turns[rotation]) if rotation in turns else frame


def _decode(video):
    cap = cv2.VideoCapture(str(video))
    if not cap.isOpened():
        raise GateError(f"Couldn't open the video {video}.")
    # OpenCV applies rotation metadata itself unless told not to; read it so we know.
    cap.set(cv2.CAP_PROP_ORIENTATION_AUTO, 1)
    fps = cap.get(cv2.CAP_PROP_FPS) or 30.0
    frames, times, sharp = [], [], []
    i = 0
    while True:
        ok, frame = cap.read()
        if not ok:
            break
        scale = MAX_SIDE / max(frame.shape[:2])
        if scale < 1:
            frame = cv2.resize(frame, None, fx=scale, fy=scale, interpolation=cv2.INTER_AREA)
        grey = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
        frames.append(frame)
        times.append(i / fps)
        sharp.append(float(cv2.Laplacian(grey, cv2.CV_64F).var()))
        i += 1
    cap.release()
    return frames, np.array(times), np.array(sharp), fps


def _head_mask(category):
    keep = np.isin(category, KEEP_CLASSES).astype(np.uint8)
    n, labels, stats, _ = cv2.connectedComponentsWithStats(keep, connectivity=8)
    if n <= 1:
        return keep * 255
    # Largest component whose top is in the upper half of the frame (the head, not a hand).
    h = category.shape[0]
    best = max(range(1, n), key=lambda k: stats[k, cv2.CC_STAT_AREA] if stats[k, cv2.CC_STAT_TOP] < h / 2 else -1)
    return (labels == best).astype(np.uint8) * 255


def run(video, work) -> dict:
    import mediapipe as mp
    from mediapipe.tasks.python import BaseOptions, vision

    work = Path(work)
    for sub in ("frames", "masks"):
        (work / sub).mkdir(parents=True, exist_ok=True)
        for old in (work / sub).glob("*.png"):
            old.unlink()

    frames, times, sharp, fps = _decode(video)
    keep = select_frames(times, sharp)
    segmenter = vision.ImageSegmenter.create_from_options(
        vision.ImageSegmenterOptions(
            base_options=BaseOptions(model_asset_path=str(MODELS / "selfie_multiclass_256x256.tflite")),
            output_category_mask=True,
        )
    )
    landmarker = vision.FaceLandmarker.create_from_options(
        vision.FaceLandmarkerOptions(
            base_options=BaseOptions(model_asset_path=str(MODELS / "face_landmarker.task")),
            num_faces=1,
            output_facial_transformation_matrixes=True,
        )
    )
    out = []
    h, w = frames[0].shape[:2]
    for n, i in enumerate(keep):
        fid = f"{n:03d}"
        rgb = cv2.cvtColor(frames[i], cv2.COLOR_BGR2RGB)
        image = mp.Image(image_format=mp.ImageFormat.SRGB, data=np.ascontiguousarray(rgb))
        mask = _head_mask(segmenter.segment(image).category_mask.numpy_view())
        res = landmarker.detect(image)
        landmarks = yaw = None
        if res.face_landmarks:
            landmarks = [[p.x * w, p.y * h, p.z * w] for p in res.face_landmarks[0]]
            yaw = yaw_from_matrix(np.array(res.facial_transformation_matrixes[0]))
        masked = frames[i].copy()
        masked[mask == 0] = 0
        cv2.imwrite(str(work / "frames" / f"{fid}.png"), masked)
        cv2.imwrite(str(work / "masks" / f"{fid}.png"), mask)
        out.append({"id": fid, "t": float(times[i]), "sharpness": float(sharp[i]), "landmarks": landmarks, "yaw_deg": yaw})
    info = {"width": w, "height": h, "fps": fps, "decoded": len(frames), "frames": out}
    (work / "frames.json").write_text(json.dumps(info))
    check_views(out)
    return info


if __name__ == "__main__":
    try:
        info = run(sys.argv[1], sys.argv[2])
    except GateError as e:
        print(e, file=sys.stderr)
        sys.exit(2)
    faces = sum(1 for f in info["frames"] if f["landmarks"])
    print(f"frames: kept {len(info['frames'])} of {info['decoded']}, {faces} show the face")
