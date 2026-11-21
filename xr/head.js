// Loads a head (.glb) and drives its blend shapes: mouth, blinks, small head movement.
import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { KTX2Loader } from "three/addons/loaders/KTX2Loader.js";
import { MeshoptDecoder } from "three/addons/libs/meshopt_decoder.module.js";
import { clampDir } from "./gaze.js";

const THREE_CDN = "https://cdn.jsdelivr.net/npm/three@0.170.0";

// Dev stand-in only (three.js sample "Face Cap" head; licence not confirmed, not committed).
export const STAND_IN_URL = "https://cdn.jsdelivr.net/gh/mrdoob/three.js@r170/examples/models/gltf/facecap.glb";

export const HEAD_HEIGHT_M = 0.24;

// Blend shape names our own head build provides first, then the ARKit names the stand-in uses.
const CHANNELS = {
  jaw: [["jawOpen", 0.7]],
  wide: [["mouthWide", 1], ["mouthStretch_L", 0.6], ["mouthStretch_R", 0.6], ["mouthSmile_L", 0.3], ["mouthSmile_R", 0.3]],
  round: [["mouthRound", 1], ["mouthFunnel", 0.8], ["mouthPucker", 0.4]],
  blink: [["eyeBlink_L", 1], ["eyeBlink_R", 1]],
};

export async function loadHead(url, renderer) {
  const ktx2 = new KTX2Loader().setTranscoderPath(`${THREE_CDN}/examples/jsm/libs/basis/`).detectSupport(renderer);
  const loader = new GLTFLoader().setKTX2Loader(ktx2).setMeshoptDecoder(MeshoptDecoder);
  const gltf = await loader.loadAsync(url);
  const head = gltf.scene;

  // Scale to a life-size head and centre it on its own origin.
  const box = new THREE.Box3().setFromObject(head);
  const size = box.getSize(new THREE.Vector3());
  head.scale.setScalar(HEAD_HEIGHT_M / size.y);
  const centre = new THREE.Box3().setFromObject(head).getCenter(new THREE.Vector3());
  head.position.sub(centre);
  const pivot = new THREE.Group();
  pivot.add(head);

  // For every mesh with blend shapes, remember which influence index each channel moves.
  const targets = [];
  head.traverse((o) => {
    if (!o.isMesh || !o.morphTargetDictionary) return;
    for (const [channel, names] of Object.entries(CHANNELS)) {
      for (const [name, weight] of names) {
        const index = o.morphTargetDictionary[name];
        if (index !== undefined) targets.push({ mesh: o, index, channel, weight });
      }
    }
  });

  const eyes = setUpEyes(head);
  head.traverse((o) => {
    if (o.isMesh && o.material?.name === "skin") fadeNeck(o);
  });

  return {
    object: pivot,
    hasMouth: targets.some((t) => t.channel === "jaw"),
    hasEyes: eyes.length > 0,
    apply(values) {
      for (const t of targets) t.mesh.morphTargetInfluences[t.index] = (values[t.channel] ?? 0) * t.weight;
    },
    // Point both eyes at a world-space point (the viewer), each eye limited to MAX_GAZE.
    lookAt(worldPoint) {
      for (const e of eyes) {
        const local = e.mesh.parent.worldToLocal(_v.copy(worldPoint));
        const dir = clampDir(e.forward, [local.x - e.mesh.position.x, local.y - e.mesh.position.y, local.z - e.mesh.position.z], MAX_GAZE);
        e.mesh.quaternion.setFromUnitVectors(e.rest, _d.set(dir[0], dir[1], dir[2]));
      }
    },
  };
}

const _v = new THREE.Vector3();
const _d = new THREE.Vector3();
const MAX_GAZE = THREE.MathUtils.degToRad(28);
// Sclera and iris come from vertex colours; this tint takes the white down so it isn't
// brighter than the lit skin around it, and the low roughness gives the eye a catchlight.
const EYE_TINT = new THREE.Color(0.74, 0.71, 0.68);
const EYE_ROUGHNESS = 0.12;

// Our heads name their eye materials eye_l / eye_r (head/uncle_head/assemble.py). For each:
// make it glossy and less white, and move its origin to the eyeball's centre so it can turn.
// The iris direction is read from the dark vertex colours, since warping the template can
// tilt it a little away from straight ahead.
function setUpEyes(head) {
  const eyes = [];
  head.traverse((o) => {
    if (!o.isMesh || !/^eye_[lr]$/.test(o.material?.name ?? "")) return;
    o.material.roughness = EYE_ROUGHNESS;
    o.material.metalness = 0;
    o.material.color.copy(EYE_TINT);
    const plain = o.quaternion.equals(new THREE.Quaternion()) && o.scale.equals(new THREE.Vector3(1, 1, 1));
    const colors = o.geometry.attributes.color;
    if (!plain || !colors) return; // still glossy, just doesn't move
    const g = o.geometry;
    g.computeBoundingSphere();
    const centre = g.boundingSphere.center.clone();
    g.translate(-centre.x, -centre.y, -centre.z);
    o.position.add(centre);
    const pos = g.attributes.position;
    const iris = new THREE.Vector3();
    const p = new THREE.Vector3();
    for (let i = 0; i < pos.count; i++) {
      const lum = 0.3 * colors.getX(i) + 0.6 * colors.getY(i) + 0.1 * colors.getZ(i);
      if (lum < 0.3) iris.add(p.fromBufferAttribute(pos, i).normalize());
    }
    if (iris.lengthSq() < 1e-8) iris.set(0, 0, 1);
    iris.normalize();
    eyes.push({ mesh: o, rest: iris, forward: [0, 0, 1] }); // the template's face looks down +z
  });
  return eyes;
}

// Fade the bottom of the neck to transparent instead of ending on a jagged cut. The cut
// slopes (the back of the neck reaches lower), so measure from the lowest point at the front.
const NECK_FADE = [0.11, 0.24]; // fraction of the skin's height above that point: fully gone .. fully shown
function fadeNeck(mesh) {
  const g = mesh.geometry;
  g.computeBoundingBox();
  const { min, max } = g.boundingBox;
  const h = max.y - min.y;
  const midZ = (min.z + max.z) / 2;
  const pos = g.attributes.position;
  let frontMin = Infinity;
  for (let i = 0; i < pos.count; i++) if (pos.getZ(i) > midZ) frontMin = Math.min(frontMin, pos.getY(i));
  if (!Number.isFinite(frontMin)) frontMin = min.y;
  const from = frontMin + NECK_FADE[0] * h;
  const to = frontMin + NECK_FADE[1] * h;
  const m = mesh.material;
  m.transparent = true;
  m.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader
      .replace("#include <common>", "#include <common>\nvarying float vNeckY;")
      .replace("#include <morphtarget_vertex>", "#include <morphtarget_vertex>\nvNeckY = transformed.y;");
    shader.fragmentShader = shader.fragmentShader
      .replace("#include <common>", "#include <common>\nvarying float vNeckY;")
      .replace("#include <dithering_fragment>", `#include <dithering_fragment>\ngl_FragColor.a *= smoothstep(${from.toFixed(5)}, ${to.toFixed(5)}, vNeckY);`);
  };
  m.needsUpdate = true;
}

// Blinks every few seconds and a slow, small sway, so the head doesn't look frozen.
export function createIdle(random = Math.random) {
  let t = 0;
  let nextBlink = 1.5 + random() * 3;
  const BLINK = 0.16;
  return function update(dt) {
    t += dt;
    let blink = 0;
    const since = t - nextBlink;
    if (since >= 0 && since < BLINK) blink = 1 - Math.abs(since / (BLINK / 2) - 1);
    if (since >= BLINK) nextBlink = t + 2.5 + random() * 3.5;
    return {
      blink,
      yaw: 0.035 * Math.sin(t * 0.35) + 0.01 * Math.sin(t * 0.9),
      pitch: 0.02 * Math.sin(t * 0.27 + 1),
    };
  };
}
