"""Steps 4 to 7: fit the template, fit hair, bake the texture, rig, export head.glb.

CLI: python -m uncle_head.assemble <work> <out_dir>   (writes out_dir/head.glb, assemble.json)
"""
from __future__ import annotations

import json
import sys
import time
from pathlib import Path

import numpy as np
from scipy.spatial import cKDTree

from .export import export_glb
from .fit import anchor_positions, warp_template
from .hair import fit_hair
from .rig import build_morphs, mouth_interior
from .template import load_head_template, vertex_normals, weld
from .texture import bake_texture
from .views import head_views

HEAD = Path(__file__).resolve().parents[1]
MODELS = HEAD / "models"
ANCHORS = HEAD / "template" / "anchors.json"
TEXTURE_VIEWS = 40
TEXTURE_SIZE = 2048
HAIR_MAX_OUT = 0.06
TEETH, TONGUE, MOUTH = (222, 216, 204), (140, 70, 66), (34, 22, 20)
SCLERA, IRIS, PUPIL = (226, 221, 212), (78, 56, 42), (22, 17, 14)


def _hair_weight(verts, faces, face_anchors):
    """0 on the face, rising to 1 from 2 to 5 cm away from any face landmark."""
    d, _ = cKDTree(face_anchors).query(verts)
    w = np.clip((d - 0.02) / 0.03, 0, 1)
    w = w * w * (3 - 2 * w)
    used = np.zeros(len(verts), bool)
    used[np.unique(faces)] = True
    return np.where(used, w, 0.0)


def _eye_colours(verts):
    c = verts.mean(0)
    d = verts - c
    d /= np.linalg.norm(d, axis=1, keepdims=True) + 1e-12
    out = np.tile(SCLERA, (len(verts), 1)).astype(float)
    out[d[:, 2] > np.cos(np.radians(26))] = IRIS
    out[d[:, 2] > np.cos(np.radians(11))] = PUPIL
    return out


def _subset(verts, faces, uvs, face_idx, morphs=None):
    f = faces[face_idx]
    used, inv = np.unique(f, return_inverse=True)
    part = {"verts": verts[used], "faces": inv.reshape(-1, 3), "uvs": uvs[used]}
    if morphs is not None:
        part["morphs"] = {k: m[used] for k, m in morphs.items()}
    return part


def run(work, out_dir) -> dict:
    work, out_dir = Path(work), Path(out_dir)
    timings = {}
    t0 = time.time()
    template = load_head_template(MODELS)
    anchors = json.loads(ANCHORS.read_text())
    points = np.array(json.loads((work / "landmarks3d.json").read_text())["points"])
    verts, warp = warp_template(template, anchors, points[anchors["landmark"]])
    timings["fit_s"] = time.time() - t0

    t0 = time.time()
    views = head_views(work)
    skin = template.parts["skin"]
    wv, wf, inv = weld(verts, template.faces[skin], template.source_index)
    weight = _hair_weight(wv, wf, anchor_positions(verts, template.faces, anchors))
    verts = fit_hair(wv, vertex_normals(wv, wf), weight, views, max_out=HAIR_MAX_OUT, faces=wf)[inv]
    timings["hair_s"] = time.time() - t0

    t0 = time.time()
    interior = mouth_interior(template, verts)
    outer_skin = np.setdiff1d(skin, interior)
    front = min(range(len(views)), key=lambda i: abs(views[i]["yaw"]) if views[i]["yaw"] is not None else 1e9)
    pick = sorted(set(np.linspace(0, len(views) - 1, TEXTURE_VIEWS).astype(int).tolist()) | {front})
    texture, tex_report = bake_texture(verts, template.faces[skin], template.uvs, [views[i] for i in pick], size=TEXTURE_SIZE, occluders=(verts, template.faces))
    timings["texture_s"] = time.time() - t0

    t0 = time.time()
    morphs = build_morphs(template, warp, MODELS)
    parts = [{"name": "skin", "texture": texture, **_subset(verts, template.faces, template.uvs, outer_skin, morphs)}]
    parts.append({"name": "mouth", "color": MOUTH, **_subset(verts, template.faces, template.uvs, interior, morphs)})
    parts.append({"name": "teeth", "color": TEETH, **_subset(verts, template.faces, template.uvs, template.parts["teeth"], morphs)})
    parts.append({"name": "tongue", "color": TONGUE, **_subset(verts, template.faces, template.uvs, template.parts["tongue"], morphs)})
    for eye in ("eye_l", "eye_r"):
        p = _subset(verts, template.faces, template.uvs, template.parts[eye], morphs)
        parts.append({"name": eye, "color": (255, 255, 255), "vertex_colors": _eye_colours(p["verts"]), **p})
    out_dir.mkdir(parents=True, exist_ok=True)
    export_glb(out_dir / "head.glb", parts)
    timings["rig_export_s"] = time.time() - t0

    report = {**timings, "texture": tex_report, "texture_views": len(pick), "glb_bytes": (out_dir / "head.glb").stat().st_size}
    (work / "assemble.json").write_text(json.dumps(report))
    return report


if __name__ == "__main__":
    r = run(sys.argv[1], sys.argv[2])
    print(f"assemble: head.glb {r['glb_bytes'] / 1e6:.1f} MB; texture {r['texture']['seen_pct']:.0f}% seen from {r['texture_views']} views")
