import numpy as np
from pygltflib import GLTF2

from uncle_head.export import export_glb
from uncle_head.rig import MORPH_NAMES


def tri_part(name, n_offset=0.0, **extra):
    v = np.array([[0, 0, 0], [1, 0, 0], [0, 1, 0]], float) + n_offset
    return {"name": name, "verts": v, "faces": np.array([[0, 1, 2]]), "uvs": np.array([[0, 0], [1, 0], [0, 1]], float), **extra}


def test_exported_head_has_the_five_morphs_and_one_texture(tmp_path):
    tex = np.zeros((8, 8, 3), np.uint8)
    morphs = {n: np.full((3, 3), 0.01 * (i + 1)) for i, n in enumerate(MORPH_NAMES)}
    parts = [tri_part("skin", texture=tex, morphs=morphs), tri_part("teeth", 2.0, color=(220, 215, 205))]
    path = tmp_path / "head.glb"
    export_glb(path, parts)
    g = GLTF2().load(str(path))
    mesh = g.meshes[0]
    assert mesh.extras["targetNames"] == MORPH_NAMES
    assert len(g.images) == 1
    for prim in mesh.primitives:  # every primitive carries all five targets (zeros where unused)
        assert len(prim.targets) == 5
        n = g.accessors[prim.attributes.POSITION].count
        assert all(g.accessors[t["POSITION"]].count == n for t in prim.targets)
    skin = mesh.primitives[0]
    assert g.accessors[skin.attributes.POSITION].count == 3
    assert skin.attributes.TEXCOORD_0 is not None
    assert g.materials[mesh.primitives[1].material].pbrMetallicRoughness.baseColorTexture is None


def test_texture_rows_follow_gltf(tmp_path):
    # OBJ v = 1 at the top of the texture is glTF v = 0.
    part = tri_part("skin", texture=np.zeros((4, 4, 3), np.uint8))
    path = tmp_path / "h.glb"
    export_glb(path, [part])
    g = GLTF2().load(str(path))
    acc = g.accessors[g.meshes[0].primitives[0].attributes.TEXCOORD_0]
    view = g.bufferViews[acc.bufferView]
    data = g.binary_blob()[view.byteOffset + (acc.byteOffset or 0):][: acc.count * 8]
    uv = np.frombuffer(data, np.float32).reshape(-1, 2)
    assert np.allclose(uv[:, 1], 1 - part["uvs"][:, 1])
