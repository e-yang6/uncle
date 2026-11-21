import json
import math

import numpy as np
import pytest

from uncle_head.cameras import check_registered, focal_prior_px, largest_model, read_cameras, write_cameras
from uncle_head.errors import GateError


def test_focal_prior_from_a_69_degree_horizontal_field_of_view():
    assert math.isclose(focal_prior_px(1920, 1080), 960 / math.tan(math.radians(34.5)), rel_tol=1e-9)


def test_focal_prior_uses_the_long_side_for_portrait_video():
    # Phone main cameras quote the field of view across the long side.
    assert math.isclose(focal_prior_px(360, 640), focal_prior_px(640, 360), rel_tol=1e-9)


def test_registration_gate():
    with pytest.raises(GateError, match="Only 23 frames"):
        check_registered(23)
    check_registered(24)


class FakeModel:
    def __init__(self, n):
        self.n = n

    def num_reg_images(self):
        return self.n


def test_largest_model_wins():
    models = {0: FakeModel(30), 1: FakeModel(80), 2: FakeModel(5)}
    assert largest_model(models).n == 80


def test_largest_model_of_none_is_none():
    assert largest_model({}) is None


def test_cameras_json_round_trip(tmp_path):
    K = np.array([[500.0, 0, 180], [0, 500, 320], [0, 0, 1]])
    R = np.eye(3)
    t = np.array([0.1, -0.2, 2.0])
    path = tmp_path / "cameras.json"
    write_cameras(path, K, [0.01], {"007": (R, t)}, "sequential")
    K2, dist, views = read_cameras(path)
    assert np.allclose(K2, K) and dist == [0.01]
    assert np.allclose(views["007"][0], R) and np.allclose(views["007"][1], t)
    assert json.loads(path.read_text())["matching"] == "sequential"
