import numpy as np
import pytest

from uncle_head.errors import GateError
from uncle_head.landmarks3d import MAX_MEDIAN_PX, MAX_P95_PX, check_reprojection, gate_scale, head_frame, reprojection_errors, triangulate_point

F = 500.0


def ring_cameras(n=10, radius=2.0):
    """Cameras on a circle in the x-z plane, all looking at the origin. Returns 3x4 normalised P."""
    Ps = []
    for a in np.linspace(-0.6, 0.6, n):  # a 70 degree arc in front of the point set
        c = radius * np.array([np.sin(a), 0.0, np.cos(a)])
        z = -c / np.linalg.norm(c)
        x = np.cross([0, 1, 0], z)
        x /= np.linalg.norm(x)
        y = np.cross(z, x)
        R = np.stack([x, y, z])
        Ps.append(np.hstack([R, (-R @ c)[:, None]]))
    return Ps


def project(P, X):
    x = P @ np.append(X, 1)
    return x[:2] / x[2]


def test_triangulation_is_exact_without_noise():
    Ps = ring_cameras()
    X = np.array([0.05, -0.03, 0.02])
    xs = [project(P, X) for P in Ps]
    assert np.allclose(triangulate_point(Ps, xs, inlier_px=4, focal_px=F), X, atol=1e-6)


def test_triangulation_survives_noise_and_an_outlier_view():
    rng = np.random.default_rng(1)
    Ps = ring_cameras()
    X = np.array([0.05, -0.03, 0.02])
    xs = [project(P, X) + rng.normal(0, 1 / F, 2) for P in Ps]
    xs[3] = xs[3] + 50 / F  # one view 50 px off
    got = triangulate_point(Ps, xs, inlier_px=4, focal_px=F)
    # 1 px of noise at 2 m is about 3.5 mm here even with no bad view; one 50 px view
    # would pull plain least squares about 3 cm off, so RANSAC must keep it out.
    assert np.linalg.norm(got - X) < 0.006


def test_reprojection_errors_are_in_pixels():
    Ps = ring_cameras(2)
    X = np.zeros(3)
    xs = [project(P, X) for P in Ps]
    xs[1] = xs[1] + np.array([3 / F, 4 / F])
    err = reprojection_errors(X, Ps, xs, focal_px=F)
    assert np.allclose(err, [0, 5])


def test_reprojection_gate():
    check_reprojection(4.0, 15.0)
    with pytest.raises(GateError, match="median"):
        check_reprojection(4.1, 5)
    with pytest.raises(GateError, match="95"):
        check_reprojection(3, 15.5)


def test_gate_limits_scale_with_video_size():
    # Limits were tuned on a 360x640 video. Ethan's 720x1280 scan (median 5.77, p95 27.5 px)
    # is the same quality in proportion and must pass; the scale comes from the frame size,
    # not COLMAP's focal estimate, so a bad camera fit can't loosen the check.
    assert gate_scale(720, 1280) == 2.0
    check_reprojection(5.77, 27.5, scale=2.0)
    with pytest.raises(GateError, match="median.*scaled x2.0"):
        check_reprojection(MAX_MEDIAN_PX * 2 + 0.1, 5, scale=2.0)
    with pytest.raises(GateError, match="95"):
        check_reprojection(1, MAX_P95_PX * 2 + 0.1, scale=2.0)


def test_gate_limits_never_tighten_for_small_videos():
    assert gate_scale(240, 320) == 1.0
    check_reprojection(4.0, 15.0, scale=gate_scale(240, 320))


def test_head_frame_scales_chin_to_hairline_to_20_cm_along_y():
    pts = np.zeros((468, 3))
    pts[10] = [0, 1.0, 0]  # hairline
    pts[152] = [0, -1.0, 0]  # chin
    pts[234] = [-0.8, 0, -0.5]  # right side of face
    pts[454] = [0.8, 0, -0.5]  # left side
    pts[1] = [0, 0, 0.6]  # nose tip
    T = head_frame(pts)
    h = (T[:3, :3] @ pts.T).T + T[:3, 3]
    assert np.isclose(np.linalg.norm(h[10] - h[152]), 0.20)
    d = (h[10] - h[152]) / 0.20
    assert np.allclose(d, [0, 1, 0], atol=1e-9)
    assert h[1][2] > 0  # nose points down +z
    assert np.allclose((h[234] + h[454]) / 2, 0, atol=1e-9)
