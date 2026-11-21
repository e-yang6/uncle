import numpy as np
import pytest

from uncle_head.errors import GateError
from uncle_head.frames import check_views, select_frames, yaw_from_matrix


def test_select_keeps_at_most_max_n_in_time_order():
    times = np.arange(600) / 25.0
    sharp = np.random.default_rng(0).random(600)
    keep = select_frames(times, sharp, max_n=200)
    assert len(keep) <= 200
    assert keep == sorted(keep)


def test_select_prefers_the_sharpest_frame_in_each_window():
    times = np.arange(10) / 10.0  # 1 s of video
    sharp = np.array([1, 9, 1, 1, 1, 1, 1, 1, 8, 1], float)
    keep = select_frames(times, sharp, max_n=2)
    assert keep == [1, 8]


def frames(n_views, n_faces):
    return [{"landmarks": [[0, 0, 0]] * 468 if i < n_faces else None} for i in range(n_views)]


def test_check_views_needs_24_views():
    with pytest.raises(GateError, match="Only 23 usable views"):
        check_views(frames(23, 23))


def test_check_views_needs_12_face_views():
    with pytest.raises(GateError, match="Only 11 views show the face"):
        check_views(frames(30, 11))


def test_check_views_passes_at_the_limits():
    check_views(frames(24, 12))


def test_yaw_of_an_unrotated_head_is_zero():
    assert abs(yaw_from_matrix(np.eye(4))) < 1e-9


def test_yaw_of_a_head_turned_30_degrees():
    a = np.radians(30)
    m = np.eye(4)
    m[:3, :3] = [[np.cos(a), 0, np.sin(a)], [0, 1, 0], [-np.sin(a), 0, np.cos(a)]]
    assert abs(yaw_from_matrix(m) - 30) < 1e-6
