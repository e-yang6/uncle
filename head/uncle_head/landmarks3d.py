"""Step 3: triangulate MediaPipe's 468 face landmarks into 3D from the registered cameras.

CLI: python -m uncle_head.landmarks3d <work>
Writes work/landmarks3d.json: points in the head frame (metres), views per point, held-out
reprojection error, and to_head (4x4, world -> head frame).

Head frame: origin between landmarks 234 and 454 (the sides of the face), +y from chin (152)
to hairline (10), +z out through the nose (1); scaled so hairline to chin is 0.20 m.
"""
from __future__ import annotations

import json
import sys
from pathlib import Path

import cv2
import numpy as np

from .cameras import read_cameras
from .errors import GateError

HAIRLINE, CHIN, SIDE_R, SIDE_L, NOSE = 10, 152, 234, 454, 1
HAIRLINE_TO_CHIN_M = 0.20
# Pixel limits were tuned on a 360x640 video. Reprojection error in pixels grows with
# resolution, so the limits scale with the frame's long side over 640 (a 720x1280 video gets
# limits twice as large), never below these values. Frame size, not COLMAP's focal estimate,
# so a bad camera fit can't loosen the check.
REF_LONG_SIDE_PX = 640
INLIER_PX = 4.0
MAX_MEDIAN_PX = 4.0
# Was 12: it rejected a 720x1280 scan that built well (p95 27.5 px, i.e. 13.8 at 360x640 scale).
MAX_P95_PX = 15.0
HOLDOUT_EVERY = 5
RANSAC_PAIRS = 60


def _dlt(Ps, xs):
    A = []
    for P, (u, v) in zip(Ps, xs):
        A.append(u * P[2] - P[0])
        A.append(v * P[2] - P[1])
    X = np.linalg.svd(np.array(A))[2][-1]
    return X[:3] / X[3]


def reprojection_errors(X, Ps, xs, focal_px) -> np.ndarray:
    """Pixel distance between each view's observation and the projected point (normalised coords x focal)."""
    out = []
    for P, x in zip(Ps, xs):
        p = P @ np.append(X, 1)
        out.append(np.inf if p[2] <= 0 else np.linalg.norm(p[:2] / p[2] - x) * focal_px)
    return np.array(out)


def triangulate_point(Ps, xs, inlier_px=INLIER_PX, focal_px=1.0, rng=None) -> np.ndarray:
    """RANSAC over pairs of views, then least squares (DLT) on the inliers."""
    n = len(Ps)
    if n < 2:
        raise ValueError("need two views")
    rng = rng or np.random.default_rng(0)
    pairs = [(i, j) for i in range(n) for j in range(i + 1, n)]
    if len(pairs) > RANSAC_PAIRS:
        pairs = [pairs[k] for k in rng.choice(len(pairs), RANSAC_PAIRS, replace=False)]
    best = None
    for i, j in pairs:
        X = _dlt([Ps[i], Ps[j]], [xs[i], xs[j]])
        inliers = reprojection_errors(X, Ps, xs, focal_px) < inlier_px
        if best is None or inliers.sum() > best.sum():
            best = inliers
    idx = np.flatnonzero(best) if best.sum() >= 2 else np.arange(n)
    return _dlt([Ps[k] for k in idx], [xs[k] for k in idx])


def gate_scale(width, height) -> float:
    """How much larger the pixel limits are for this video than for the 360x640 tuning video."""
    return max(1.0, max(width, height) / REF_LONG_SIDE_PX)


def check_reprojection(median, p95, scale=1.0) -> None:
    def fail(what, value, limit):
        raise GateError(f"Face points don't line up between frames ({what} {value:.1f} px, limit {limit * scale:.1f}, scaled x{scale:.1f} for this video's size). Film again holding a neutral face and turning slowly.")
    if median > MAX_MEDIAN_PX * scale:
        fail("median", median, MAX_MEDIAN_PX)
    if p95 > MAX_P95_PX * scale:
        fail("95th percentile", p95, MAX_P95_PX)


def head_frame(points) -> np.ndarray:
    """4x4 similarity transform from world to the head frame (see module docstring)."""
    p = np.asarray(points)
    origin = (p[SIDE_R] + p[SIDE_L]) / 2
    y = p[HAIRLINE] - p[CHIN]
    scale = HAIRLINE_TO_CHIN_M / np.linalg.norm(y)
    y = y / np.linalg.norm(y)
    x = p[SIDE_L] - p[SIDE_R]
    x = x - (x @ y) * y
    x /= np.linalg.norm(x)
    z = np.cross(x, y)
    if (p[NOSE] - origin) @ z < 0:
        x, z = -x, -z
    R = np.stack([x, y, z])
    T = np.eye(4)
    T[:3, :3] = scale * R
    T[:3, 3] = -scale * R @ origin
    return T


def _normalised(landmarks, K, dist):
    pts = np.asarray(landmarks, float)[:, :2].reshape(-1, 1, 2)
    d = np.array([dist[0], 0, 0, 0], float)
    return cv2.undistortPoints(pts, K, d).reshape(-1, 2)


def run(work) -> dict:
    work = Path(work)
    info = json.loads((work / "frames.json").read_text())
    K, dist, cams = read_cameras(work / "cameras.json")
    focal = K[0, 0]
    views = [f for f in info["frames"] if f["landmarks"] and f["id"] in cams]
    held = views[HOLDOUT_EVERY - 1 :: HOLDOUT_EVERY]
    used = [v for v in views if v not in held]
    if len(used) < 2:
        raise GateError("Too few frames show the face from placed cameras. Film again facing the camera at the start and end.")

    def P_of(v):
        R, t = cams[v["id"]]
        return np.hstack([R, t[:, None]])

    used_P = [P_of(v) for v in used]
    used_x = [_normalised(v["landmarks"], K, dist) for v in used]
    held_P = [P_of(v) for v in held]
    held_x = [_normalised(v["landmarks"], K, dist) for v in held]

    points, per_point = [], []
    held_err = []
    scale = gate_scale(info["width"], info["height"])
    inlier_px = INLIER_PX * scale
    for i in range(468):
        xs = [x[i] for x in used_x]
        X = triangulate_point(used_P, xs, inlier_px=inlier_px, focal_px=focal)
        per_point.append(int((reprojection_errors(X, used_P, xs, focal) < inlier_px).sum()))
        points.append(X)
        if held:
            held_err.extend(reprojection_errors(X, held_P, [x[i] for x in held_x], focal))
    points = np.array(points)
    held_err = np.array(held_err)
    median, p95 = float(np.median(held_err)), float(np.percentile(held_err, 95))
    T = head_frame(points)
    head_pts = (T[:3, :3] @ points.T).T + T[:3, 3]
    out = {
        "points": head_pts.tolist(),
        "views_per_point": per_point,
        "heldout_px": {"median": median, "p95": p95, "views": len(held), "limit_scale": scale},
        "used_views": len(used),
        "to_head": T.tolist(),
    }
    (work / "landmarks3d.json").write_text(json.dumps(out))
    check_reprojection(median, p95, scale=scale)
    return out


if __name__ == "__main__":
    try:
        r = run(sys.argv[1])
    except GateError as e:
        print(e, file=sys.stderr)
        sys.exit(2)
    h = r["heldout_px"]
    print(f"landmarks: 468 points from {r['used_views']} views; held-out error median {h['median']:.2f} px, 95th {h['p95']:.2f} px over {h['views']} views")
