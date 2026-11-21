"""A small z-buffer rasteriser in numpy (no OpenGL), for visibility, depth and debug renders.

Camera convention as OpenCV/COLMAP: x_cam = R @ X + t, x right, y down, z forward.
"""
from __future__ import annotations

import numpy as np


def look_at(eye, target, up=(0, 1, 0)):
    eye, target, up = (np.asarray(a, float) for a in (eye, target, up))
    z = target - eye
    z /= np.linalg.norm(z)
    x = np.cross(z, up)  # right, with y pointing down
    x /= np.linalg.norm(x)
    y = np.cross(z, x)
    R = np.stack([x, y, z])
    return R, -R @ eye


def render(verts, faces, K, R, t, size, k1=0.0):
    """Returns rgb (H,W,3) uint8 Lambert-shaded grey, face_id (H,W) int (-1 empty),
    bary (H,W,3) barycentric weights, depth (H,W) camera z (inf empty).
    k1: SIMPLE_RADIAL distortion, applied to vertices (as views.project does)."""
    H, W = size
    cam = verts @ R.T + t
    z = cam[:, 2]
    with np.errstate(divide="ignore", invalid="ignore"):
        n = cam[:, :2] / z[:, None]
    n = n * (1 + k1 * (n**2).sum(1))[:, None]
    px = n * K[0, 0] + K[:2, 2]
    depth = np.full((H, W), np.inf)
    face_id = np.full((H, W), -1, dtype=np.int64)
    bary = np.zeros((H, W, 3))

    for fi, (a, b, c) in enumerate(faces):
        if z[a] <= 0 or z[b] <= 0 or z[c] <= 0:
            continue
        pa, pb, pc = px[a], px[b], px[c]
        x0, x1 = int(max(np.floor(min(pa[0], pb[0], pc[0])), 0)), int(min(np.ceil(max(pa[0], pb[0], pc[0])), W - 1))
        y0, y1 = int(max(np.floor(min(pa[1], pb[1], pc[1])), 0)), int(min(np.ceil(max(pa[1], pb[1], pc[1])), H - 1))
        if x0 > x1 or y0 > y1:
            continue
        area = (pb[0] - pa[0]) * (pc[1] - pa[1]) - (pc[0] - pa[0]) * (pb[1] - pa[1])
        if abs(area) < 1e-12:
            continue
        xs, ys = np.meshgrid(np.arange(x0, x1 + 1) + 0.5, np.arange(y0, y1 + 1) + 0.5)
        w0 = ((pb[0] - xs) * (pc[1] - ys) - (pc[0] - xs) * (pb[1] - ys)) / area
        w1 = ((pc[0] - xs) * (pa[1] - ys) - (pa[0] - xs) * (pc[1] - ys)) / area
        w2 = 1 - w0 - w1
        inside = (w0 >= 0) & (w1 >= 0) & (w2 >= 0)
        if not inside.any():
            continue
        # Perspective-correct depth: interpolate 1/z.
        inv_z = w0 / z[a] + w1 / z[b] + w2 / z[c]
        zz = 1 / inv_z
        sub = depth[y0 : y1 + 1, x0 : x1 + 1]
        closer = inside & (zz < sub)
        if not closer.any():
            continue
        sub[closer] = zz[closer]
        face_id[y0 : y1 + 1, x0 : x1 + 1][closer] = fi
        pw = np.stack([w0 / z[a], w1 / z[b], w2 / z[c]], -1) * zz[..., None]
        bary[y0 : y1 + 1, x0 : x1 + 1][closer] = pw[closer]

    # Lambert shading with the light at the camera.
    n = np.cross(verts[faces[:, 1]] - verts[faces[:, 0]], verts[faces[:, 2]] - verts[faces[:, 0]])
    n /= np.linalg.norm(n, axis=1, keepdims=True) + 1e-12
    view = -(R.T @ np.array([0, 0, 1.0]))  # direction from surface towards the camera
    shade = np.abs(n @ view)
    rgb = np.zeros((H, W, 3), np.uint8)
    hit = face_id >= 0
    rgb[hit] = (40 + 200 * shade[face_id[hit]])[:, None].astype(np.uint8)
    return rgb, face_id, bary, depth
