// Loads a head (.glb) and drives its blend shapes: mouth, blinks, small head movement.
import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { KTX2Loader } from "three/addons/loaders/KTX2Loader.js";
import { MeshoptDecoder } from "three/addons/libs/meshopt_decoder.module.js";

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

  return {
    object: pivot,
    hasMouth: targets.some((t) => t.channel === "jaw"),
    apply(values) {
      for (const t of targets) t.mesh.morphTargetInfluences[t.index] = (values[t.channel] ?? 0) * t.weight;
    },
  };
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
