import json
from pathlib import Path

import numpy as np
import pytest

from uncle_head.fit import warp_template
from uncle_head.render import look_at, render
from uncle_head.rig import MORPH_NAMES, build_morphs, mouth_interior

ANCHORS = Path(__file__).resolve().parents[1] / "template" / "anchors.json"


@pytest.fixture(scope="module")
def rigged(template, models_dir):
    a = json.loads(ANCHORS.read_text())
    # Identity warp: targets are the template's own anchor positions.
    from uncle_head.fit import anchor_positions

    verts, warp = warp_template(template, a, anchor_positions(template.verts, template.faces, a))
    return verts, build_morphs(template, warp, models_dir)


def centre(template, verts, part):
    return verts[np.unique(template.faces[template.parts[part]])].mean(0)


def mouth_centre(template, verts):
    teeth = centre(template, verts, "teeth")
    return np.array([0.0, teeth[1], verts[:, 2].max() - 0.03])


def test_five_morphs_with_the_contract_names(rigged, template):
    _, morphs = rigged
    assert list(morphs) == ["jawOpen", "mouthWide", "mouthRound", "eyeBlink_L", "eyeBlink_R"] == MORPH_NAMES
    for m in morphs.values():
        assert m.shape == template.verts.shape


def test_mouth_shapes_stay_round_the_mouth_and_blinks_round_their_eye(rigged, template):
    verts, morphs = rigged
    regions = {"jawOpen": mouth_centre(template, verts), "mouthWide": mouth_centre(template, verts), "mouthRound": mouth_centre(template, verts),
               "eyeBlink_L": centre(template, verts, "eye_l"), "eyeBlink_R": centre(template, verts, "eye_r")}
    for name, c in regions.items():
        moved = np.linalg.norm(morphs[name], axis=1) > 1e-4
        assert moved.any(), name
        # The jaw pivots near the ears, so jawOpen reaches further back than the other shapes.
        limit = 0.11 if name == "jawOpen" else 0.08
        assert np.linalg.norm(verts[moved] - c, axis=1).max() < limit, name


def test_eye_blink_l_closes_the_eye_on_plus_x(rigged, template):
    verts, morphs = rigged
    moved = np.linalg.norm(morphs["eyeBlink_L"], axis=1) > 1e-4
    assert verts[moved, 0].mean() > 0 and centre(template, verts, "eye_l")[0] > 0


def test_jaw_open_drops_the_chin(rigged, template):
    verts, morphs = rigged
    chin = np.argmin(verts[:, 1] + 10 * np.abs(verts[:, 0]) - 2 * verts[:, 2] + 100 * (verts[:, 1] < 0.6))
    dy = morphs["jawOpen"][chin, 1]
    assert -0.06 < dy < -0.005


def test_opening_the_jaw_shows_the_inside_of_the_mouth(rigged, template):
    verts, morphs = rigged
    inside = set(mouth_interior(template, verts).tolist())
    inside |= set(template.parts["teeth"].tolist()) | set(template.parts["tongue"].tolist())
    c = mouth_centre(template, verts)
    K = np.array([[3000.0, 0, 64], [0, 3000, 64], [0, 0, 1]])
    R, t = look_at(c + [0, 0, 0.5], c)

    def inside_rows(v):
        _, fid, _, _ = render(v, template.faces, K, R, t, (128, 128))
        return sum(int(f) in inside for f in fid[:, 64])

    closed, opened = inside_rows(verts), inside_rows(verts + morphs["jawOpen"])
    assert opened >= closed + 5, (closed, opened)


def test_mouth_interior_is_behind_the_lips(rigged, template):
    verts, _ = rigged
    faces = mouth_interior(template, verts)
    assert len(faces) > 0
    teeth_front = verts[np.unique(template.faces[template.parts["teeth"]]), 2].max()
    assert verts[template.faces[faces]].mean(1)[:, 2].max() < teeth_front
