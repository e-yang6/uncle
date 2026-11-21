"""Fit the scalp and back of the head to the person's outline (silhouettes from every view).

Each weighted vertex moves out along its normal to the furthest point that still falls inside
the head mask in at least INSIDE_SHARE of the views that see it, bounded by max_out; the
offsets are then smoothed over the mesh so hair reads as one smooth shape.
"""
from __future__ import annotations

import numpy as np

from .views import project

INSIDE_SHARE = 0.8
STEP_M = 0.002


def _inside_share(points, views):
    inside = np.zeros(len(points))
    seen = np.zeros(len(points))
    for v in views:
        px = project(v["K"], v["k1"], v["R"], v["t"], points)
        H, W = v["mask"].shape
        ok = np.isfinite(px).all(1)
        x = np.where(ok, px[:, 0], -1).astype(int)
        y = np.where(ok, px[:, 1], -1).astype(int)
        ok &= (x >= 0) & (x < W) & (y >= 0) & (y < H)
        seen += ok
        inside[ok] += v["mask"][y[ok], x[ok]]
    with np.errstate(invalid="ignore", divide="ignore"):
        return np.where(seen > 0, inside / np.maximum(seen, 1), 0.0)


def _neighbours(n, faces):
    nb = [set() for _ in range(n)]
    for a, b, c in faces:
        nb[a] |= {b, c}
        nb[b] |= {a, c}
        nb[c] |= {a, b}
    return [np.fromiter(s, int) for s in nb]


def fit_hair(verts, normals, weight, views, max_out=0.04, smooth_iters=10, faces=None) -> np.ndarray:
    verts = np.asarray(verts, float)
    weight = np.asarray(weight, float)
    active = np.flatnonzero(weight > 0)
    offset = np.zeros(len(verts))
    for d in np.arange(STEP_M, max_out + 1e-12, STEP_M):
        if not len(active):
            break
        share = _inside_share(verts[active] + d * normals[active], views)
        ok = share >= INSIDE_SHARE
        offset[active[ok]] = d
        active = active[ok]  # stop growing once a vertex leaves the outline
    if smooth_iters and faces is not None:
        nb = _neighbours(len(verts), faces)
        for _ in range(smooth_iters):
            offset = np.array([offset[i] if len(n) == 0 else 0.5 * offset[i] + 0.5 * offset[n].mean() for i, n in enumerate(nb)])
    return verts + (weight * np.clip(offset, 0, max_out))[:, None] * normals
