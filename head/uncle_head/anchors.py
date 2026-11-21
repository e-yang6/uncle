"""One-time: match MediaPipe's 468 landmarks to points on the template.

Renders the template front-on with skin, hair and eye colours, runs FaceLandmarker on the
render, and looks each landmark up in the render's face and barycentric buffers.
CLI: python -m uncle_head.anchors  -> head/template/anchors.json and a debug image.
"""
from __future__ import annotations

import json
import sys
from pathlib import Path

import cv2
import numpy as np

from .render import look_at, render
from .template import load_head_template

HEAD = Path(__file__).resolve().parents[1]
MODELS = HEAD / "models"
OUT = HEAD / "template" / "anchors.json"
SIZE = 1024
COLOURS = {"skin": (224, 172, 140), "hair": (60, 45, 35), "eye_l": (70, 60, 55), "eye_r": (70, 60, 55), "teeth": (230, 230, 220), "tongue": (150, 70, 70)}


def front_camera(verts):
    centre = np.array([0.0, (verts[:, 1].max() + 0.60) / 2, 0.05])
    R, t = look_at(eye=centre + [0, 0, 0.9], target=centre)
    f = SIZE * 0.9 / 0.34  # about 0.34 m of head fills 90% of the image at 0.9 m
    K = np.array([[f, 0, SIZE / 2], [0, f, SIZE / 2], [0, 0, 1]])
    return K, R, t


def coloured_render(template, K, R, t):
    # The hair helper is a long-hair proxy that hangs over the face, so it's left out.
    shown = np.concatenate([idx for name, idx in template.parts.items() if name != "hair"])
    faces = np.full_like(template.faces, 0)
    faces[shown] = template.faces[shown]
    hidden = np.setdiff1d(np.arange(len(template.faces)), shown)
    faces[hidden] = 0  # degenerate triangles: never drawn
    grey, face_id, bary, depth = render(template.verts, faces, K, R, t, (SIZE, SIZE))
    part_of = np.empty(len(template.faces), dtype=object)
    for name, idx in template.parts.items():
        part_of[idx] = name
    rgb = np.full((SIZE, SIZE, 3), 255, np.uint8)  # plain white background
    hit = face_id >= 0
    shade = grey[hit, 0:1].astype(float) / 240
    base = np.array([COLOURS[p] for p in part_of[face_id[hit]]], float)
    rgb[hit] = np.clip(base * (0.35 + 0.75 * shade), 0, 255).astype(np.uint8)
    return rgb, face_id, bary


def make_anchors(template):
    import mediapipe as mp
    from mediapipe.tasks.python import BaseOptions, vision

    K, R, t = front_camera(template.verts)
    rgb, face_id, bary = coloured_render(template, K, R, t)
    landmarker = vision.FaceLandmarker.create_from_options(
        vision.FaceLandmarkerOptions(base_options=BaseOptions(model_asset_path=str(MODELS / "face_landmarker.task")), num_faces=1)
    )
    res = landmarker.detect(mp.Image(image_format=mp.ImageFormat.SRGB, data=np.ascontiguousarray(rgb)))
    if not res.face_landmarks:
        return None, rgb
    out = {"landmark": [], "face": [], "bary": []}
    skin = set(template.parts["skin"].tolist())
    for i, p in enumerate(res.face_landmarks[0][:468]):  # the last 10 are iris points
        x, y = int(p.x * SIZE), int(p.y * SIZE)
        if 0 <= x < SIZE and 0 <= y < SIZE and int(face_id[y, x]) in skin:
            out["landmark"].append(i)
            out["face"].append(int(face_id[y, x]))
            out["bary"].append(bary[y, x].tolist())
    dbg = cv2.cvtColor(rgb, cv2.COLOR_RGB2BGR)
    for p in res.face_landmarks[0]:
        cv2.circle(dbg, (int(p.x * SIZE), int(p.y * SIZE)), 2, (0, 0, 255), -1)
    return out, dbg


if __name__ == "__main__":
    template = load_head_template(MODELS)
    anchors, image = make_anchors(template)
    debug = HEAD / "builds" / "_debug"
    debug.mkdir(parents=True, exist_ok=True)
    cv2.imwrite(str(debug / "anchors.png"), image if anchors else cv2.cvtColor(image, cv2.COLOR_RGB2BGR))
    if anchors is None:
        print("No face found on the template render; see head/builds/_debug/anchors.png", file=sys.stderr)
        sys.exit(2)
    OUT.parent.mkdir(exist_ok=True)
    OUT.write_text(json.dumps(anchors))
    print(f"anchors: {len(anchors['landmark'])} of 468 landmarks anchored -> {OUT}")
