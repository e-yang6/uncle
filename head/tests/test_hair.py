import numpy as np

from uncle_head.hair import fit_hair
from uncle_head.render import look_at
from uncle_head.views import project, to_head_camera


def sphere(r, n=24):
    th, ph = np.meshgrid(np.linspace(0.1, np.pi - 0.1, n), np.linspace(0, 2 * np.pi, n, endpoint=False))
    return r * np.stack([np.sin(th) * np.cos(ph), np.cos(th), np.sin(th) * np.sin(ph)], -1).reshape(-1, 3)


def ring_views(radius_obj, n=12, size=200, f=400.0):
    views = []
    for a in np.linspace(0, 2 * np.pi, n, endpoint=False):
        eye = 1.0 * np.array([np.sin(a), 0.2, np.cos(a)])
        R, t = look_at(eye, [0, 0, 0])
        K = np.array([[f, 0, size / 2], [0, f, size / 2], [0, 0, 1]])
        yy, xx = np.mgrid[0:size, 0:size] + 0.5
        # Exact silhouette of a sphere: pixels whose ray passes within radius of the centre.
        d = np.stack([(xx - size / 2) / f, (yy - size / 2) / f, np.ones_like(xx)], -1)
        d = d @ R  # camera to world directions
        d /= np.linalg.norm(d, axis=-1, keepdims=True)
        c = eye
        dist = np.linalg.norm(np.cross(d, -c), axis=-1)
        views.append({"K": K, "k1": 0.0, "R": R, "t": t, "mask": dist <= radius_obj})
    return views


def test_a_small_sphere_grows_to_fill_a_bigger_silhouette():
    v = sphere(0.10)
    normals = v / np.linalg.norm(v, axis=1, keepdims=True)
    out = fit_hair(v, normals, np.ones(len(v)), ring_views(0.12), max_out=0.04, smooth_iters=0)
    r = np.linalg.norm(out, axis=1)
    assert np.median(np.abs(r - 0.12)) < 0.005


def test_growth_never_passes_the_bound():
    v = sphere(0.10)
    normals = v / np.linalg.norm(v, axis=1, keepdims=True)
    out = fit_hair(v, normals, np.ones(len(v)), ring_views(0.30), max_out=0.04, smooth_iters=0)
    assert np.linalg.norm(out - v, axis=1).max() <= 0.04 + 1e-9


def test_zero_weight_vertices_stay_put():
    v = sphere(0.10)
    normals = v / np.linalg.norm(v, axis=1, keepdims=True)
    out = fit_hair(v, normals, np.zeros(len(v)), ring_views(0.12), max_out=0.04, smooth_iters=0)
    assert np.allclose(out, v)


def test_camera_moved_into_the_head_frame_sees_the_same_pixel():
    R, t = look_at([0.3, 0.1, 2.0], [0, 0, 0])
    K = np.array([[500.0, 0, 100], [0, 500, 100], [0, 0, 1]])
    a = 0.4
    Rh = np.array([[np.cos(a), 0, np.sin(a)], [0, 1, 0], [-np.sin(a), 0, np.cos(a)]])
    to_head = np.eye(4)
    to_head[:3, :3] = 0.5 * Rh
    to_head[:3, 3] = [0.1, -0.2, 0.05]
    X = np.array([[0.05, 0.02, -0.03]])
    Xh = X @ to_head[:3, :3].T + to_head[:3, 3]
    R2, t2 = to_head_camera(R, t, to_head)
    assert np.allclose(project(K, 0.0, R, t, X), project(K, 0.0, R2, t2, Xh))
