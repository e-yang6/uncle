// A floating chart panel beside the mirror (PLAN.md Part 3 step 4). A new chart replaces the
// old one with a short fade; the panel fades away by itself after a while unless it's held.
// Grabbing: a controller trigger or a hand pinch (both fire XR "select") picks it up; it
// stays where it's let go.
import * as THREE from "three";
import { drawChart } from "./charts.js";
import { isCard, drawCard } from "./cards.js";
import { panelOpacity } from "./fade.js";

const PX_PER_M = 2000;

export function createChartPanel({ width = 0.36, height = 0.24 } = {}) {
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(width * PX_PER_M);
  canvas.height = Math.round(height * PX_PER_M);
  const ctx = canvas.getContext("2d");
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  const material = new THREE.MeshBasicMaterial({ map: texture, transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide });
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(width, height), material);
  mesh.visible = false;
  mesh.renderOrder = 9;
  let age = Infinity; // seconds since the current chart arrived
  let held = false;
  let pending = null; // the next chart, drawn once the old one has faded out

  function draw(chart) {
    if (!(isCard(chart) ? drawCard : drawChart)(ctx, chart, canvas.width, canvas.height)) return false;
    texture.needsUpdate = true;
    age = 0;
    mesh.visible = true;
    return true;
  }

  return {
    mesh,
    get held() {
      return held;
    },
    set held(v) {
      held = v;
      if (v) age = Math.min(age, 1); // keep it up while someone is moving it
    },
    // Returns false if the message can't be drawn (it's then ignored).
    show(chart) {
      if (!mesh.visible || material.opacity < 0.05) return draw(chart);
      pending = chart; // fade the old one out first
      return true;
    },
    update(dt) {
      if (!mesh.visible) return;
      if (held) age = Math.min(age, 1);
      else age += dt;
      if (pending) {
        material.opacity = Math.max(0, material.opacity - dt * 4);
        if (material.opacity === 0) {
          draw(pending);
          pending = null;
        }
        return;
      }
      material.opacity = panelOpacity(age);
      if (material.opacity === 0 && age > 1) mesh.visible = false;
    },
  };
}
