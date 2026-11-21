"""Cameras and images of a build, moved into the head frame."""
from __future__ import annotations

import json
from pathlib import Path

import cv2
import numpy as np

from .cameras import read_cameras


def project(K, k1, R, t, X) -> np.ndarray:
    """Pixel coordinates (N,2) of points X (N,3), with SIMPLE_RADIAL distortion k1. Points
    behind the camera come out as nan."""
    c = np.asarray(X) @ R.T + t
    z = c[:, 2]
    with np.errstate(divide="ignore", invalid="ignore"):
        n = c[:, :2] / z[:, None]
    n = n * (1 + k1 * (n**2).sum(1))[:, None]
    px = n * K[0, 0] + K[:2, 2]
    px[z <= 0] = np.nan
    return px


def to_head_camera(R, t, to_head):
    """World-to-camera (R, t) -> head-to-camera, for to_head = [s Rh | th]. Projection
    ignores the overall scale, so the result is scaled by s."""
    sRh = np.asarray(to_head)[:3, :3]
    th = np.asarray(to_head)[:3, 3]
    s = np.cbrt(np.linalg.det(sRh))
    Rh = sRh / s
    R2 = R @ Rh.T
    return R2, s * t - R2 @ th


def head_views(work):
    """Every registered frame as {id, K, k1, R, t, image (RGB), mask (bool), yaw} in the head frame."""
    work = Path(work)
    info = json.loads((work / "frames.json").read_text())
    K, dist, cams = read_cameras(work / "cameras.json")
    to_head = np.array(json.loads((work / "landmarks3d.json").read_text())["to_head"])
    out = []
    for f in info["frames"]:
        if f["id"] not in cams:
            continue
        R, t = to_head_camera(*cams[f["id"]], to_head)
        image = cv2.cvtColor(cv2.imread(str(work / "frames" / f"{f['id']}.png")), cv2.COLOR_BGR2RGB)
        mask = cv2.imread(str(work / "masks" / f"{f['id']}.png"), cv2.IMREAD_GRAYSCALE) > 127
        out.append({"id": f["id"], "K": K, "k1": dist[0], "R": R, "t": t, "image": image, "mask": mask, "yaw": f["yaw_deg"]})
    return out
