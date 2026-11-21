"""Write a head as one glTF binary: one mesh, a primitive per part, the five morph targets on
every primitive (zeros where a part doesn't move), names in mesh.extras.targetNames (three.js
reads these into morphTargetDictionary)."""
from __future__ import annotations

import io

import numpy as np
from PIL import Image
from pygltflib import (
    ARRAY_BUFFER,
    ELEMENT_ARRAY_BUFFER,
    FLOAT,
    GLTF2,
    UNSIGNED_INT,
    Accessor,
    Asset,
    Attributes,
    Buffer,
    BufferView,
    Material,
    Mesh,
    Node,
    PbrMetallicRoughness,
    Primitive,
    Sampler,
    Scene,
    Texture,
    TextureInfo,
)
from pygltflib import Image as GImage

from .rig import MORPH_NAMES
from .template import vertex_normals


def _linear(rgb):
    c = np.asarray(rgb, float) / 255
    return np.where(c <= 0.04045, c / 12.92, ((c + 0.055) / 1.055) ** 2.4).tolist()


class _Builder:
    def __init__(self):
        self.blob = bytearray()
        self.views, self.accessors = [], []

    def add(self, data: bytes, target=None) -> int:
        while len(self.blob) % 4:
            self.blob.append(0)
        self.views.append(BufferView(buffer=0, byteOffset=len(self.blob), byteLength=len(data), target=target))
        self.blob += data
        return len(self.views) - 1

    def accessor(self, array, kind, target=ARRAY_BUFFER, minmax=False) -> int:
        if kind == "SCALAR":
            arr = np.ascontiguousarray(array, np.uint32)
            ctype = UNSIGNED_INT
        else:
            arr = np.ascontiguousarray(array, np.float32)
            ctype = FLOAT
        view = self.add(arr.tobytes(), target)
        extra = {}
        if minmax:
            extra = {"min": arr.min(0).tolist(), "max": arr.max(0).tolist()}
        self.accessors.append(Accessor(bufferView=view, componentType=ctype, count=len(arr), type=kind, **extra))
        return len(self.accessors) - 1


def export_glb(path, parts) -> None:
    """parts: [{name, verts (n,3), faces (m,3), uvs (n,2), texture (HxWx3 uint8) or color (r,g,b),
    morphs: {name: (n,3)} optional}]"""
    b = _Builder()
    materials, images, textures, primitives = [], [], [], []
    for part in parts:
        verts = np.asarray(part["verts"], float)
        faces = np.asarray(part["faces"])
        attrs = Attributes(
            POSITION=b.accessor(verts, "VEC3", minmax=True),
            NORMAL=b.accessor(vertex_normals(verts, faces), "VEC3"),
            TEXCOORD_0=b.accessor(np.column_stack([part["uvs"][:, 0], 1 - part["uvs"][:, 1]]), "VEC2"),
        )
        if part.get("vertex_colors") is not None:
            attrs.COLOR_0 = b.accessor(np.array([_linear(c) for c in part["vertex_colors"]]), "VEC3")  # glTF vertex colours are linear
        morphs = part.get("morphs") or {}
        targets = [{"POSITION": b.accessor(morphs.get(n, np.zeros_like(verts)), "VEC3", minmax=True)} for n in MORPH_NAMES]
        pbr = PbrMetallicRoughness(metallicFactor=0.0, roughnessFactor=0.85)
        if part.get("texture") is not None:
            png = io.BytesIO()
            Image.fromarray(part["texture"]).save(png, format="PNG")
            images.append(GImage(bufferView=b.add(png.getvalue()), mimeType="image/png"))
            textures.append(Texture(source=len(images) - 1, sampler=0))
            pbr.baseColorTexture = TextureInfo(index=len(textures) - 1)
        else:
            pbr.baseColorFactor = _linear(part.get("color", (200, 200, 200))) + [1.0]
        materials.append(Material(name=part["name"], pbrMetallicRoughness=pbr))
        primitives.append(Primitive(attributes=attrs, indices=b.accessor(faces.reshape(-1), "SCALAR", ELEMENT_ARRAY_BUFFER), material=len(materials) - 1, targets=targets))

    g = GLTF2(
        asset=Asset(generator="uncle head build", version="2.0"),
        scene=0,
        scenes=[Scene(nodes=[0])],
        nodes=[Node(mesh=0, name="head")],
        meshes=[Mesh(name="head", primitives=primitives, weights=[0.0] * len(MORPH_NAMES), extras={"targetNames": MORPH_NAMES})],
        materials=materials,
        images=images,
        textures=textures,
        samplers=[Sampler(magFilter=9729, minFilter=9987)] if images else [],
        accessors=b.accessors,
        bufferViews=b.views,
        buffers=[Buffer(byteLength=len(b.blob))],
    )
    g.set_binary_blob(bytes(b.blob))
    g.save_binary(str(path))
