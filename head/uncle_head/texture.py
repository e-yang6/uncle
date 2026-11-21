"""Bake a texture for a mesh from the photographed views.

For each texel: its 3D point and normal (by rasterising the mesh in UV space). The most
frontal view paints the face wherever it sees it at under FRONT_MAX_DEG; elsewhere the best
views are blended over a BLEND_DEG band. Visibility is a depth test against each view's
depth map. Every view's exposure is matched to the frontal view on the texels they share.
Texels no view sees get the fallback colour (the mean seen colour by default).

Texture rows follow glTF: row r is v = 1 - r / size in OBJ terms.
"""
from __future__ import annotations

import cv2
import numpy as np

from .render import render
from .template import vertex_normals
from .views import project

FRONT_MAX_DEG = 60.0
BLEND_DEG = 10.0
DEPTH_TOL = 0.004  # metres: how far behind the visible surface still counts as visible


def exposure_gain(ref, other) -> np.ndarray:
    """Per-channel gain making `other` colours match `ref` on shared texels (median ratio)."""
    ref, other = np.asarray(ref, float), np.asarray(other, float)
    ok = (other > 8).all(1) & (ref > 8).all(1)
    if ok.sum() < 20:
        return np.ones(3)
    return np.median(ref[ok] / other[ok], axis=0)


def _texel_points(verts, faces, uvs, size):
    """3D point and normal for every texel covered by the UV layout."""
    uv_px = np.column_stack([uvs[:, 0] * size, (1 - uvs[:, 1]) * size, np.ones(len(uvs))])
    _, face_id, bary, _ = render(uv_px, faces, np.eye(3), np.eye(3), np.zeros(3), (size, size))
    hit = face_id >= 0
    fid = face_id[hit]
    tri = faces[fid]
    w = bary[hit]
    normals = vertex_normals(verts, faces)
    P = np.einsum("nk,nkj->nj", w, verts[tri])
    N = np.einsum("nk,nkj->nj", w, normals[tri])
    N /= np.linalg.norm(N, axis=1, keepdims=True) + 1e-12
    return hit, P, N


def bake_texture(verts, faces, uvs, views, size=2048, occluders=None, fallback=None):
    verts, faces, uvs = np.asarray(verts, float), np.asarray(faces), np.asarray(uvs, float)
    occ_v, occ_f = occluders if occluders is not None else (verts, faces)
    hit, P, N = _texel_points(verts, faces, uvs, size)
    n = len(P)
    front = min(range(len(views)), key=lambda i: abs(views[i]["yaw"]) if views[i]["yaw"] is not None else 1e9)

    angles = np.full((len(views), n), np.inf)
    colours = np.zeros((len(views), n, 3))
    for i, v in enumerate(views):
        H, W = v["image"].shape[:2]
        _, _, _, depth = render(occ_v, occ_f, v["K"], v["R"], v["t"], (H, W))
        px = project(v["K"], v["k1"], v["R"], v["t"], P)
        cam_z = P @ v["R"][2] + v["t"][2]
        ok = np.isfinite(px).all(1)
        x = np.where(ok, np.round(px[:, 0] - 0.5), -1).astype(int)
        y = np.where(ok, np.round(px[:, 1] - 0.5), -1).astype(int)
        ok &= (x >= 0) & (x < W) & (y >= 0) & (y < H)
        ok[ok] &= cam_z[ok] <= depth[y[ok], x[ok]] + DEPTH_TOL
        if "mask" in v:  # never take colour from the blacked-out background (or its edge)
            inner = cv2.erode(v["mask"].astype(np.uint8), np.ones((3, 3), np.uint8)) > 0
            ok[ok] &= inner[y[ok], x[ok]]
        centre = -v["R"].T @ v["t"]
        to_cam = centre - P
        to_cam /= np.linalg.norm(to_cam, axis=1, keepdims=True)
        ang = np.degrees(np.arccos(np.clip((N * to_cam).sum(1), -1, 1)))
        ok &= ang < 89
        angles[i, ok] = ang[ok]
        colours[i, ok] = v["image"][y[ok], x[ok]]

    # Match every view's exposure to the frontal view.
    for i in range(len(views)):
        if i == front:
            continue
        shared = np.isfinite(angles[i]) & np.isfinite(angles[front])
        if shared.sum() >= 20:
            colours[i] *= exposure_gain(colours[front, shared], colours[i, shared])

    best = angles.min(0)
    visible = np.isfinite(angles)
    gap = np.where(visible, angles - np.where(np.isfinite(best), best, 0), np.inf)
    weights = np.where(visible, np.clip(BLEND_DEG - gap, 0, None), 0.0)
    use_front = angles[front] < FRONT_MAX_DEG
    weights[:, use_front] = 0
    weights[front, use_front] = 1
    total = weights.sum(0)
    seen = total > 0
    out = np.zeros((n, 3))
    out[seen] = (weights[:, seen, None] * colours[:, seen]).sum(0) / total[seen, None]
    fill = np.asarray(fallback, float) if fallback is not None else (out[seen].mean(0) if seen.any() else np.full(3, 128.0))
    out[~seen] = fill

    tex = np.zeros((size, size, 3), np.uint8)
    tex[hit] = np.clip(out, 0, 255).astype(np.uint8)
    # Grow colours past the UV island edges so filtering doesn't pull in black at seams.
    covered = hit.astype(np.uint8)
    for _ in range(8):
        grown = cv2.dilate(tex, np.ones((3, 3), np.uint8))
        newly = (cv2.dilate(covered, np.ones((3, 3), np.uint8)) > 0) & (covered == 0)
        tex[newly] = grown[newly]
        covered[newly] = 1
    report = {"frontal_id": views[front]["id"], "frontal_yaw": views[front]["yaw"], "seen_pct": float(100 * seen.mean()) if n else 0.0}
    return tex, report
