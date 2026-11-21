"""Load the head of the CC0 MakeHuman hm08 base mesh (via naver/anny) and its targets.

Frame: metres, +y up, the face looks down +z. The template is centred near the hips,
so the head sits around y = 0.6 to 0.85 m.
"""
from __future__ import annotations

import gzip
from dataclasses import dataclass, field
from pathlib import Path

import numpy as np

DM_TO_M = 0.1
NECK_Y = 0.54  # keep a little neck below the chin
CHIN_Y = 0.60  # measured on the template's front midline
NECK_HALF_WIDTH = 0.08  # below the chin, keep only the neck, not the shoulders

# base.obj group -> our part name. Eyelashes, body helpers below the neck are dropped.
GROUPS = {
    "body": "skin",
    "helper-l-eye": "eye_l",
    "helper-r-eye": "eye_r",
    "helper-upper-teeth": "teeth",
    "helper-lower-teeth": "teeth",
    "helper-tongue": "tongue",
    "helper-hair": "hair",
}


@dataclass
class Template:
    verts: np.ndarray  # (N,3) metres
    faces: np.ndarray  # (M,3) int
    uvs: np.ndarray  # (N,2)
    source_index: np.ndarray  # (N,) index into base.obj vertices
    parts: dict[str, np.ndarray] = field(default_factory=dict)  # part -> face indices


def _read_obj(path: Path):
    verts, uvs, faces = [], [], []  # faces: (group, [(v, vt), ...])
    group = None
    with open(path) as fh:
        for line in fh:
            if line.startswith("v "):
                verts.append([float(x) for x in line.split()[1:4]])
            elif line.startswith("vt "):
                uvs.append([float(x) for x in line.split()[1:3]])
            elif line.startswith("g "):
                group = line.split()[1]
            elif line.startswith("f ") and group in GROUPS:
                corners = []
                for p in line.split()[1:]:
                    v, vt = p.split("/")[:2]
                    corners.append((int(v) - 1, int(vt) - 1))
                faces.append((group, corners))
    return np.array(verts) * DM_TO_M, np.array(uvs), faces


def load_head_template(models_dir) -> Template:
    src_verts, src_uvs, src_faces = _read_obj(Path(models_dir) / "base.obj")

    keys: dict[tuple[int, int], int] = {}  # (v, vt) -> new vertex, so each vertex has one UV
    new_src, new_uv, faces, part_of_face = [], [], [], []
    for group, corners in src_faces:
        vs = src_verts[[v for v, _ in corners]]
        if vs[:, 1].min() < NECK_Y:
            continue
        if (vs[:, 1] < CHIN_Y).any() and np.abs(vs[:, 0]).max() > NECK_HALF_WIDTH:
            continue
        ids = []
        for key in corners:
            if key not in keys:
                keys[key] = len(new_src)
                new_src.append(key[0])
                new_uv.append(src_uvs[key[1]])
            ids.append(keys[key])
        tris = [ids[:3]] if len(ids) == 3 else [[ids[0], ids[1], ids[2]], [ids[0], ids[2], ids[3]]]
        for tri in tris:
            faces.append(tri)
            part_of_face.append(GROUPS[group])

    source_index = np.array(new_src)
    part_of_face = np.array(part_of_face)
    return Template(
        verts=src_verts[source_index],
        faces=np.array(faces, dtype=np.int64),
        uvs=np.clip(np.array(new_uv), 0.0, 1.0),
        source_index=source_index,
        parts={p: np.flatnonzero(part_of_face == p) for p in sorted(set(GROUPS.values()))},
    )


def load_target(models_dir, path, template: Template) -> np.ndarray:
    """A MakeHuman .target(.gz): lines 'index dx dy dz' (0-based base.obj index, decimetres)."""
    full = Path(models_dir) / path
    opener = gzip.open if full.suffix == ".gz" else open
    deltas = {}
    with opener(full, "rt") as fh:
        for line in fh:
            parts = line.split()
            if len(parts) == 4 and not line.startswith("#"):
                deltas[int(parts[0])] = [float(x) * DM_TO_M for x in parts[1:]]
    out = np.zeros_like(template.verts)
    for i, src in enumerate(template.source_index):
        d = deltas.get(int(src))
        if d is not None:
            out[i] = d
    return out


def weld(verts, faces, source_index):
    """Join vertices that were split on UV seams (same base.obj vertex).
    Returns (welded verts, welded faces, inverse) with welded[inverse] == verts."""
    uniq, first, inverse = np.unique(source_index, return_index=True, return_inverse=True)
    return np.asarray(verts)[first], inverse[np.asarray(faces)], inverse


def vertex_normals(verts, faces) -> np.ndarray:
    n = np.zeros_like(verts)
    fn = np.cross(verts[faces[:, 1]] - verts[faces[:, 0]], verts[faces[:, 2]] - verts[faces[:, 0]])
    for k in range(3):
        np.add.at(n, faces[:, k], fn)
    return n / (np.linalg.norm(n, axis=1, keepdims=True) + 1e-12)
