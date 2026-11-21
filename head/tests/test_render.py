import numpy as np

from uncle_head.render import look_at, render


def cube():
    v = np.array([[x, y, z] for x in (-0.5, 0.5) for y in (-0.5, 0.5) for z in (-0.5, 0.5)], float)
    quads = [(0, 1, 3, 2), (4, 6, 7, 5), (0, 4, 5, 1), (2, 3, 7, 6), (0, 2, 6, 4), (1, 5, 7, 3)]
    f = []
    for a, b, c, d in quads:
        f += [(a, b, c), (a, c, d)]
    return v, np.array(f)


def test_front_view_of_a_cube_fills_the_centre_not_the_corners():
    v, f = cube()
    K = np.array([[300.0, 0, 64], [0, 300, 64], [0, 0, 1]])
    R, t = look_at(eye=[0, 0, 4], target=[0, 0, 0])
    rgb, face_id, bary, depth = render(v, f, K, R, t, (128, 128))
    assert face_id[64, 64] >= 0
    assert face_id[0, 0] == -1 and face_id[127, 127] == -1
    hit = face_id >= 0
    assert np.allclose(bary[hit].sum(axis=1), 1, atol=1e-6)
    assert np.isclose(depth[64, 64], 3.5, atol=1e-3)  # front face at z = 0.5, camera at 4
    assert rgb[64, 64].max() > rgb[0, 0].max()


def test_front_face_hides_the_back_face():
    v, f = cube()
    K = np.array([[300.0, 0, 64], [0, 300, 64], [0, 0, 1]])
    R, t = look_at(eye=[0, 0, 4], target=[0, 0, 0])
    _, face_id, _, _ = render(v, f, K, R, t, (128, 128))
    front = {i for i, tri in enumerate(f) if np.allclose(v[tri][:, 2], 0.5)}
    assert face_id[64, 64] in front
