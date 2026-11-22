// The future self's upper body, outfit and backdrop (CONTRACTS.md "Look tiers"). Four wealth looks and four posture
// levels, driven by the wealth_tier and health_tier on the server's facts message. They blend over about 0.4 s when a
// slider moves (DESIGN-RULES: slow, smooth, nothing bounces). Works on any saved head with no rebuild: the head file
// stops at the neck, so the shoulders and clothes are drawn here, in the mirror's space (face centre at the origin,
// chin about 0.14 m down, facing +z).
import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { LOOKS, postureFor, tierOf, approach } from "./looks-data.js";
import { paintBackdrop, BACKDROP_SIZE } from "./backdrops.js";

const NECK_BASE_Y = -0.19; // where the shoulders start under the chin
const BLEND_SECONDS = 0.4;

const mat = (color, extra = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.9, metalness: 0, flatShading: false, transparent: true, opacity: 0, ...extra });

// Shoulders to waist, symmetric, origin at the base of the neck (x across, y up).
function torsoShape(half = 0.262, drop = 0.31) {
  const s = new THREE.Shape();
  s.moveTo(-0.056, 0.02);
  s.quadraticCurveTo(-0.12, 0.0, -0.2, -0.03);
  s.quadraticCurveTo(-half, -0.055, -half - 0.005, -0.12);
  s.lineTo(-half, -drop);
  s.lineTo(half, -drop);
  s.lineTo(half + 0.005, -0.12);
  s.quadraticCurveTo(half, -0.055, 0.2, -0.03);
  s.quadraticCurveTo(0.12, 0.0, 0.056, 0.02);
  s.closePath();
  return s;
}
const extrude = (shape, depth, bevel = 0.008) => {
  const g = new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: true, bevelThickness: bevel, bevelSize: bevel, bevelSegments: 2, curveSegments: 14 });
  g.translate(0, 0, -depth / 2);
  return g;
};
const tri = (pts) => { const s = new THREE.Shape(); pts.forEach(([x, y], i) => (i ? s.lineTo(x, y) : s.moveTo(x, y))); s.closePath(); return s; };
const mirrorPts = (pts) => pts.map(([x, y]) => [-x, y]);

// One outfit: a group of meshes at the torso's local origin.
function buildOutfit(look, skin) {
  const g = new THREE.Group();
  const add = (geo, color, pos = [0, 0, 0], extra) => { const m = new THREE.Mesh(geo, mat(color, extra)); m.position.set(...pos); g.add(m); return m; };
  const front = 0.062; // z of the chest's front face
  add(extrude(torsoShape(), 0.11), look.body);

  // Arms hanging at the sides: a sleeve, a cuff, a bare wrist and hand in the face's skin tone. Out of sight in the
  // laptop view (it stops at the chest) but in the headset the whole person is there.
  for (const side of [-1, 1]) {
    const arm = new THREE.Group();
    arm.position.set(side * 0.272, -0.07, 0);
    arm.rotation.z = side * 0.05;
    const sleeve = new THREE.Mesh(new THREE.CapsuleGeometry(0.047, 0.3, 6, 14), mat(look.body));
    sleeve.position.y = -0.17;
    arm.add(sleeve);
    const cuff = new THREE.Mesh(new THREE.CylinderGeometry(0.044, 0.044, 0.026, 16), mat(look.trim));
    cuff.position.y = -0.345;
    arm.add(cuff);
    const hand = new THREE.Mesh(new THREE.CapsuleGeometry(0.03, 0.07, 4, 10), skin);
    hand.position.y = -0.42;
    arm.add(hand);
    if (look.watch && side === -1) {
      const w = new THREE.Mesh(new THREE.TorusGeometry(0.032, 0.006, 8, 22), mat(look.watch, { roughness: 0.3, metalness: 0.8 }));
      w.rotation.x = Math.PI / 2;
      w.position.y = -0.375;
      arm.add(w);
    }
    g.add(arm);
  }

  if (look.outfit === "knit") {
    // Rolled collar and a ribbed hem.
    const ring = add(new THREE.TorusGeometry(0.062, 0.016, 10, 28), look.trim, [0, 0.008, 0.004]);
    ring.rotation.x = Math.PI / 2;
    add(new THREE.BoxGeometry(0.53, 0.026, 0.118), look.trim, [0, -0.298, 0]);
  } else if (look.outfit === "cardigan") {
    add(extrude(tri([[-0.075, 0.012], [0.075, 0.012], [0, -0.15]]), 0.004, 0.002), look.shirt, [0, 0, front]); // shirt in the V
    const c1 = add(new THREE.BoxGeometry(0.05, 0.034, 0.02), look.shirt, [-0.07, 0.006, 0.054]); c1.rotation.z = -0.5; // collar points
    const c2 = add(new THREE.BoxGeometry(0.05, 0.034, 0.02), look.shirt, [0.07, 0.006, 0.054]); c2.rotation.z = 0.5;
    add(new THREE.BoxGeometry(0.014, 0.29, 0.012), look.trim, [-0.078, -0.165, front + 0.002]); // cardigan edge, buttoned
    add(new THREE.BoxGeometry(0.014, 0.29, 0.012), look.trim, [0.078, -0.165, front + 0.002]);
  } else {
    // Blazer or tailored jacket: shirt in the V, wide lapels, a folded pocket square.
    add(extrude(tri([[-0.062, 0.014], [0.062, 0.014], [0, -0.16]]), 0.004, 0.002), look.shirt, [0, 0, front]);
    const lapel = [[-0.06, 0.02], [-0.13, -0.05], [-0.06, -0.19], [-0.012, -0.15]];
    add(extrude(tri(lapel), 0.012, 0.003), look.trim, [0, 0, front + 0.006]);
    add(extrude(tri(mirrorPts(lapel)), 0.012, 0.003), look.trim, [0, 0, front + 0.006]);
    add(new THREE.BoxGeometry(0.036, 0.02, 0.01), look.shirt, [-0.15, -0.12, front + 0.004]);
    if (look.chain) {
      // The one accent: a fine amber chain with a small pendant, lying on the shirt.
      const arc = new THREE.TorusGeometry(0.084, 0.0034, 8, 48, Math.PI);
      const chain = add(arc, look.accent, [0, 0.018, front + 0.012], { roughness: 0.25, metalness: 0.9 });
      chain.rotation.z = Math.PI;
      chain.scale.y = 1.5;
      add(new THREE.SphereGeometry(0.0095, 14, 10), look.accent, [0, -0.108, front + 0.014], { roughness: 0.25, metalness: 0.9 });
    }
  }
  return g;
}

// Real garments, one per wealth tier (xr/assets/CREDITS.md, all CC-BY 4.0): a T-shirt, a flannel shirt, a suit, a Victorian
// outfit. Each is fitted to the scanned head's shoulders and cut off below the chest (the suit and Victorian set are
// full-body, in centimetres, arms out in a T-pose). The procedural outfit above stays as the fallback if a file fails to load.
// top: where the collar sits (metres above the base of the neck, after scaling); drop: where the garment is cut off below it;
// reach: how far sideways it is cut (sleeves out in a T-pose would float away from the body).
const GARMENTS = {
  1: { url: "./assets/outfit-1.glb", top: 0.075, drop: 0.36, reach: 0.4 },
  2: { url: "./assets/outfit-2.glb", top: 0.075, drop: 0.36, reach: 0.4 },
  3: { url: "./assets/outfit-3.glb", top: 0.075, drop: 0.36, reach: 0.34 },
  4: { url: "./assets/outfit-4.glb", top: 0.075, drop: 0.36, reach: 0.34 },
};
const GARMENT_SCALE = 1.25; // real shoulders are about 0.21 m either side; ours are 0.262

function fitGarment(root, cfg, tint) {
  // Centimetre files (suit, Victorian set) to metres.
  let box = new THREE.Box3().setFromObject(root);
  const unit = box.max.y - box.min.y > 10 ? 0.01 : 1;
  const holder = new THREE.Group();
  holder.add(root);
  holder.scale.setScalar(unit * GARMENT_SCALE);
  holder.updateMatrixWorld(true);
  box = new THREE.Box3().setFromObject(holder);
  const centre = box.getCenter(new THREE.Vector3());
  holder.position.set(-centre.x, cfg.top - box.max.y, -centre.z);
  // Clip below the chest and out past the shoulders. Planes are kept in the holder's parent space; update() moves them with the posture.
  const local = [new THREE.Plane(new THREE.Vector3(0, 1, 0), cfg.drop), new THREE.Plane(new THREE.Vector3(1, 0, 0), cfg.reach), new THREE.Plane(new THREE.Vector3(-1, 0, 0), cfg.reach)];
  const world = local.map((p) => p.clone());
  holder.traverse((m) => {
    if (!m.isMesh) return;
    for (const mt of [].concat(m.material)) {
      mt.transparent = true;
      mt.side = THREE.DoubleSide;
      mt.clippingPlanes = world;
      mt.metalness = Math.min(mt.metalness ?? 0, 0.1);
    }
  });
  return { holder, local, world };
}

export function createLooks() {
  const group = new THREE.Group();
  group.name = "looks";

  // Backdrops: one plane per tier behind the head, cross-faded.
  const backdrops = {};
  const bg = new THREE.Group();
  group.add(bg);
  for (const tier of [1, 2, 3, 4]) {
    let texture = null;
    if (typeof document !== "undefined") {
      const canvas = document.createElement("canvas");
      canvas.width = BACKDROP_SIZE.w;
      canvas.height = BACKDROP_SIZE.h;
      paintBackdrop(canvas.getContext("2d"), tier);
      texture = new THREE.CanvasTexture(canvas);
      texture.colorSpace = THREE.SRGBColorSpace;
    }
    const m = new THREE.MeshBasicMaterial({ map: texture, transparent: true, opacity: 0, depthWrite: false });
    // Real photo backdrops (xr/assets/backdrop-N.webp, from Poly Haven panoramas, feathered edges); the painted scene
    // above stays as the fallback if an image fails to load.
    if (typeof document !== "undefined") {
      new THREE.TextureLoader().load(`./assets/backdrop-${tier}.webp`, (photo) => {
        photo.colorSpace = THREE.SRGBColorSpace;
        m.map = photo;
        m.needsUpdate = true;
      }, undefined, () => {});
    }
    const plane = new THREE.Mesh(new THREE.PlaneGeometry(1.3, 0.98), m);
    plane.position.set(0, -0.1, -0.3);
    plane.renderOrder = -2;
    plane.visible = false;
    bg.add(plane);
    backdrops[tier] = { plane, mat: m, alpha: 0 };
  }

  // Outfits on a body group so posture can move them together.
  const body = new THREE.Group();
  body.position.set(0, NECK_BASE_Y, -0.02);
  group.add(body);
  // A short neck in the person's skin tone: the head file's own neck fades out, which would leave a gap above the collar.
  const neckMat = new THREE.MeshStandardMaterial({ color: new THREE.Color(0.5, 0.36, 0.3), roughness: 0.8, metalness: 0 });
  const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.052, 0.066, 0.17, 28), neckMat);
  neck.position.set(0, -0.115, -0.04);
  neck.scale.z = 0.7; // a shallower neck so its lower edge hides behind the collar
  group.add(neck);
  const outfits = {};
  const garments = []; // loaded real garments, for the clipping planes
  for (const tier of [1, 2, 3, 4]) {
    const o = buildOutfit(LOOKS[tier], neckMat);
    o.visible = false;
    body.add(o);
    outfits[tier] = { group: o, alpha: 0 };
    if (typeof document !== "undefined") {
      new GLTFLoader().load(GARMENTS[tier].url, (gltf) => {
        const g = fitGarment(gltf.scene, GARMENTS[tier]);
        for (const c of [...o.children]) o.remove(c); // swap the procedural outfit for the real one
        o.add(g.holder);
        garments.push({ ...g, group: o });
      }, undefined, () => {});
    }
  }

  // A walking cane leaning against the right side when health is in the lowest tier (CONTRACTS.md: a cane or armrest nearby).
  const caneMat = mat("#4a443b", { roughness: 0.6 });
  const cane = new THREE.Group();
  const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.0085, 0.0075, 0.62, 12), caneMat);
  shaft.position.y = -0.3;
  const crook = new THREE.Mesh(new THREE.TorusGeometry(0.036, 0.0095, 8, 20, Math.PI), caneMat);
  crook.position.set(-0.036, 0.0, 0);
  cane.add(shaft, crook);
  cane.position.set(0.37, -0.13, 0.06);
  cane.rotation.z = -0.05;
  cane.visible = false;
  group.add(cane);
  let caneAlpha = 0;

  const state = { wealth: 2, health: 3 }; // targets; start in the middle until the server says otherwise
  const posture = { drop: 0, width: 1, lean: 0 };
  const targetPosture = () => postureFor(state.health);
  const setOpacity = (o, a) => o.group.traverse((m) => {
    if (!m.isMesh) return;
    for (const mt of [].concat(m.material)) {
      if (mt === neckMat) continue; // the neck is shared with the fallback outfit's hands and must stay opaque
      mt.opacity = a;
      mt.transparent = a < 0.995 || !mt.map; // fully shown textured garments draw opaque, so they sort and depth-test properly
    }
  });

  // Show a look immediately with no blending (first frame, tests).
  function snap() {
    caneAlpha = state.health === 1 ? 1 : 0;
    for (const t of [1, 2, 3, 4]) {
      const on = t === state.wealth ? 1 : 0;
      outfits[t].alpha = on;
      backdrops[t].alpha = on;
    }
    Object.assign(posture, targetPosture());
    apply();
  }

  function apply() {
    cane.visible = caneAlpha > 0.01;
    caneMat.opacity = caneAlpha;
    for (const t of [1, 2, 3, 4]) {
      const o = outfits[t], b = backdrops[t];
      o.group.visible = o.alpha > 0.01;
      setOpacity(o, o.alpha);
      b.plane.visible = b.alpha > 0.01;
      b.mat.opacity = b.alpha;
    }
    body.position.y = NECK_BASE_Y - posture.drop;
    body.scale.x = posture.width;
    body.rotation.x = posture.lean;
    // Move each garment's clipping planes with the body (planes are in world space).
    if (garments.length) {
      body.updateMatrixWorld(true);
      for (const g of garments) for (let i = 0; i < g.local.length; i++) g.world[i].copy(g.local[i]).applyMatrix4(g.group.matrixWorld);
    }
  }

  snap();
  return {
    group,
    // Both arguments are the server's 1 to 4 (or null: keep the middle look).
    setTiers(wealth, health) {
      state.wealth = tierOf(wealth);
      state.health = tierOf(health);
    },
    get tiers() { return { ...state }; },
    // Linear-colour skin tone from the head (head.skinTone); keeps the neck the same shade as the face.
    setSkin(color) {
      if (color) neckMat.color.copy(color);
    },
    snap,
    update(dt) {
      for (const t of [1, 2, 3, 4]) {
        const on = t === state.wealth ? 1 : 0;
        outfits[t].alpha = approach(outfits[t].alpha, on, dt, BLEND_SECONDS);
        backdrops[t].alpha = approach(backdrops[t].alpha, on, dt, BLEND_SECONDS * 1.5);
      }
      caneAlpha = approach(caneAlpha, state.health === 1 ? 1 : 0, dt, BLEND_SECONDS);
      const target = targetPosture();
      const k = 1 - Math.exp(-dt * 6); // exponential ease, settles in about 0.5 s
      for (const key of ["drop", "width", "lean"]) posture[key] += (target[key] - posture[key]) * k;
      apply();
    },
  };
}
