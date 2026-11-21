import numpy as np

from uncle_head.fit import anchor_positions, warp_template


def fake_anchors(template, n=60, seed=0):
    rng = np.random.default_rng(seed)
    skin = template.parts["skin"]
    faces = rng.choice(skin, n, replace=False)
    bary = rng.dirichlet([1, 1, 1], n)
    return {"landmark": list(range(n)), "face": faces.tolist(), "bary": bary.tolist()}


def test_targets_at_the_anchors_leave_the_template_unchanged(template):
    a = fake_anchors(template)
    targets = anchor_positions(template.verts, template.faces, a)
    warped, _ = warp_template(template, a, targets)
    assert np.allclose(warped, template.verts, atol=1e-9)


def test_a_constant_offset_moves_everything_by_that_offset(template):
    a = fake_anchors(template)
    targets = anchor_positions(template.verts, template.faces, a) + [0.01, -0.02, 0.03]
    warped, warp = warp_template(template, a, targets)
    assert np.allclose(warped - template.verts, [0.01, -0.02, 0.03], atol=1e-6)
    assert np.allclose(warp(template.verts[:5]), warped[:5])


def test_anchors_land_on_their_targets(template):
    rng = np.random.default_rng(3)
    a = fake_anchors(template)
    targets = anchor_positions(template.verts, template.faces, a) + rng.normal(0, 0.003, (60, 3))
    src = anchor_positions(template.verts, template.faces, a)
    warped, warp = warp_template(template, a, targets, smoothing=0.0)
    assert np.abs(warp(src) - targets).max() < 1e-6  # the warp passes through every anchor
    # Read back through the mesh, the anchor is interpolated across its triangle.
    assert np.abs(anchor_positions(warped, template.faces, a) - targets).max() < 0.002
