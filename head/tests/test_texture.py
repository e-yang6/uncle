import numpy as np

from uncle_head.render import look_at
from uncle_head.texture import bake_texture, exposure_gain

K = np.array([[200.0, 0, 64], [0, 200, 64], [0, 0, 1]])


def quad(z, size=0.4):
    s = size / 2
    v = np.array([[-s, -s, z], [s, -s, z], [s, s, z], [-s, s, z]], float)
    uv = np.array([[0, 0], [1, 0], [1, 1], [0, 1]], float)
    return v, np.array([[0, 1, 2], [0, 2, 3]]), uv


def view(colour, eye=(0, 0, 2.0), vid="000", yaw=0.0):
    R, t = look_at(np.array(eye), [0, 0, 0])
    img = np.zeros((128, 128, 3), np.uint8)
    img[:] = colour
    return {"id": vid, "K": K, "k1": 0.0, "R": R, "t": t, "image": img, "yaw": yaw}


def test_a_quad_facing_the_camera_takes_the_image_colour():
    v, f, uv = quad(0.0)
    tex, report = bake_texture(v, f, uv, [view((200, 30, 30))], size=64)
    centre = tex[32, 32].astype(int)
    assert abs(centre[0] - 200) <= 2 and centre[1] <= 32
    assert report["seen_pct"] > 90


def test_a_hidden_quad_gets_the_fallback_colour_not_the_image():
    front_v, front_f, front_uv = quad(0.3, size=1.0)  # big quad in front, hides the back one
    back_v, back_f, back_uv = quad(0.0)
    occluders = (np.vstack([front_v, back_v]), np.vstack([front_f, back_f + 4]))
    tex, report = bake_texture(back_v, back_f, back_uv, [view((200, 30, 30))], size=64, occluders=occluders, fallback=(90, 90, 90))
    assert tuple(tex[32, 32]) == (90, 90, 90)
    assert report["seen_pct"] < 5


def test_exposure_gain_corrects_a_darker_view():
    ref = np.full((500, 3), 120.0)
    dark = ref / 2.0
    g = exposure_gain(ref, dark)
    assert np.allclose(dark * g, ref, rtol=0.05)


def test_pixels_outside_the_head_mask_are_never_used():
    v, f, uv = quad(0.0)
    bg = view((0, 0, 0))  # masked-out background is black
    bg["mask"] = np.zeros((128, 128), bool)
    tex, report = bake_texture(v, f, uv, [bg], size=64, fallback=(90, 90, 90))
    assert tuple(tex[32, 32]) == (90, 90, 90)
