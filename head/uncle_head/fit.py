"""Warp the template onto the person's 3D landmarks: a similarity alignment, then a smooth
thin-plate RBF on the remaining displacements (SciPy)."""
from __future__ import annotations

import numpy as np
from scipy.interpolate import RBFInterpolator

SMOOTHING_STEPS = (0.0, 1e-4, 1e-3, 1e-2)
MAX_EDGE_RATIO = 1.5


def anchor_positions(verts, faces, anchors) -> np.ndarray:
    tri = verts[faces[np.asarray(anchors["face"])]]  # (A,3,3)
    return np.einsum("ak,akj->aj", np.asarray(anchors["bary"]), tri)


def similarity(src, dst):
    """Umeyama: s, R, t with dst ~ s R src + t."""
    ms, md = src.mean(0), dst.mean(0)
    a, b = src - ms, dst - md
    U, S, Vt = np.linalg.svd(b.T @ a / len(src))
    D = np.eye(3)
    D[2, 2] = np.sign(np.linalg.det(U @ Vt))
    R = U @ D @ Vt
    s = np.trace(np.diag(S) @ D) / (a**2).sum(1).mean()
    return s, R, md - s * R @ ms


def _edge_ratio(v0, v1, faces):
    e = np.concatenate([faces[:, [0, 1]], faces[:, [1, 2]], faces[:, [2, 0]]])
    l0 = np.linalg.norm(v0[e[:, 0]] - v0[e[:, 1]], axis=1)
    l1 = np.linalg.norm(v1[e[:, 0]] - v1[e[:, 1]], axis=1)
    ok = l0 > 1e-9
    r = l1[ok] / l0[ok]
    return float(np.max(np.maximum(r, 1 / np.maximum(r, 1e-9))))


def warp_template(template, anchors, points, smoothing=None):
    """points: target position for each anchor, in the head frame. Returns (verts, warp_fn).

    smoothing=None picks the smallest step in SMOOTHING_STEPS whose worst edge stretch
    stays under MAX_EDGE_RATIO."""
    src = anchor_positions(template.verts, template.faces, anchors)
    dst = np.asarray(points, float)
    s, R, t = similarity(src, dst)

    def align(X):
        return s * np.asarray(X) @ R.T + t

    aligned = align(template.verts)
    src_a = align(src)
    resid = dst - src_a
    if np.abs(resid).max() < 1e-12:
        return aligned, align

    steps = SMOOTHING_STEPS if smoothing is None else (smoothing,)
    for sm in steps:
        rbf = RBFInterpolator(src_a, resid, kernel="thin_plate_spline", smoothing=sm, degree=1)
        warped = aligned + rbf(aligned)
        if smoothing is not None or _edge_ratio(aligned, warped, template.faces) < MAX_EDGE_RATIO:
            break

    def warp(X):
        A = align(X)
        return A + rbf(A)

    return warped, warp
