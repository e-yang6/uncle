import numpy as np

from uncle_head.template import CHIN_Y, NECK_Y, load_target

PARTS = ("skin", "eye_l", "eye_r", "teeth", "tongue")
MOUTH_OPEN = "targets/expression/units/caucasian/mouth-open.target.gz"


def test_only_the_head_is_kept(template):
    used = np.unique(template.faces)
    assert template.verts[used, 1].min() >= NECK_Y - 1e-9


def test_head_is_life_size_from_chin_to_crown(template):
    height = template.verts[:, 1].max() - CHIN_Y
    assert 0.20 <= height <= 0.30


def test_all_parts_present_and_triangulated(template):
    assert set(PARTS) <= set(template.parts)
    assert template.faces.shape[1] == 3
    n = len(template.verts)
    for name in PARTS:
        idx = template.parts[name]
        assert len(idx) > 0, name
        assert template.faces[idx].max() < n


def test_every_vertex_has_one_uv_and_a_source(template):
    assert template.uvs.shape == (len(template.verts), 2)
    assert template.source_index.shape == (len(template.verts),)
    assert (template.uvs >= 0).all() and (template.uvs <= 1).all()


def test_quads_were_split_into_two_triangles(template):
    # The template is all quads, so face count is even and each quad's pair shares an edge.
    f = template.faces
    assert len(f) % 2 == 0
    a, b = set(f[0]), set(f[1])
    assert len(a & b) == 2


def test_mouth_open_target_moves_only_the_lower_face(template, models_dir):
    delta = load_target(models_dir, MOUTH_OPEN, template)
    assert delta.shape == template.verts.shape
    moved = np.linalg.norm(delta, axis=1) > 1e-6
    assert moved.any()
    eye_bottom_y = template.verts[np.unique(template.faces[template.parts["eye_l"]]), 1].min()
    assert template.verts[moved, 1].max() < eye_bottom_y
    assert np.linalg.norm(delta, axis=1).max() < 0.05


def test_below_the_chin_only_the_neck_is_kept(template):
    used = np.unique(template.faces)
    v = template.verts[used]
    below = v[:, 1] < CHIN_Y
    assert np.abs(v[below, 0]).max() <= 0.08


def test_weld_joins_vertices_split_on_uv_seams(template):
    from uncle_head.template import weld

    wverts, wfaces, inverse = weld(template.verts, template.faces, template.source_index)
    assert len(wverts) == len(np.unique(template.source_index)) < len(template.verts)
    assert np.allclose(wverts[inverse], template.verts)
    assert np.array_equal(inverse[template.faces], wfaces)


def test_the_long_hair_helper_is_not_loaded(template):
    # It hangs in front of the face, so it would hide the face from every camera.
    assert "hair" not in template.parts
