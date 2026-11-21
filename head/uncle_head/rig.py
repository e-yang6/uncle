"""Mouth and expression morph targets, from the CC0 MakeHuman expression units.

Each target is carried through the same warp as the head: morph = warp(base + delta) - warp(base),
so expressions fit the person's face shape. The template's mouth is already open between
the lips (teeth and tongue sit behind), so nothing is cut; the skin inside the mouth is
marked so it can be drawn dark.
"""
from __future__ import annotations

import numpy as np

from .template import load_target

UNITS = "targets/expression/units/caucasian/"
MORPHS = {
    "jawOpen": [("mouth-open", 1.0)],
    "mouthWide": [("mouth-retraction", 0.7), ("mouth-corner-puller", 0.3)],
    "mouthRound": [("mouth-pursing", 0.7), ("mouth-protusion", 0.3)],
    "eyeBlink_L": [("eye-left-closure", 1.0)],  # MakeHuman left = the character's left = +x
    "eyeBlink_R": [("eye-right-closure", 1.0)],
}
MORPH_NAMES = list(MORPHS)
INTERIOR_RADIUS_M = 0.03


def build_morphs(template, warp, models_dir) -> dict[str, np.ndarray]:
    base = warp(template.verts)
    out = {}
    for name, parts in MORPHS.items():
        delta = sum(w * load_target(models_dir, f"{UNITS}{unit}.target.gz", template) for unit, w in parts)
        moved = np.linalg.norm(delta, axis=1) > 0
        morph = np.zeros_like(base)
        morph[moved] = warp(template.verts[moved] + delta[moved]) - base[moved]
        out[name] = morph
    return out


def mouth_interior(template, verts) -> np.ndarray:
    """Skin faces inside the mouth: near the teeth and behind their front."""
    teeth_v = verts[np.unique(template.faces[template.parts["teeth"]])]
    centre = teeth_v.mean(0)
    front_z = teeth_v[:, 2].max()
    skin = template.parts["skin"]
    c = verts[template.faces[skin]].mean(1)
    inside = (np.linalg.norm(c - centre, axis=1) < INTERIOR_RADIUS_M) & (c[:, 2] < front_z)
    return skin[inside]
