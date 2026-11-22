// Caption and status drawn into the 3D scene under the mirror. The Quest browser doesn't show
// the dom-overlay panel in passthrough AR, so in the headset the text has to be a textured plane.
import * as THREE from "three";
import { wrapLines } from "./wrap.js";

const PX_PER_M = 2400; // canvas pixels per metre of panel
const FONT = '"IBM Plex Sans", system-ui, sans-serif';

export function createCaption3d({ width = 0.5, height = 0.12, ink = "#15130f", paper = "#f3eee4", dusk = "#8a8378" } = {}) {
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(width * PX_PER_M);
  canvas.height = Math.round(height * PX_PER_M);
  const ctx = canvas.getContext("2d");
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  const mesh = new THREE.Mesh(
    new THREE.PlaneGeometry(width, height),
    // Always drawn on top: the upper body and backdrop (xr/looks.js) sit in the same space.
    new THREE.MeshBasicMaterial({ map: texture, transparent: true, depthWrite: false, depthTest: false }),
  );
  mesh.renderOrder = 30;
  let caption = "";
  let status = "";

  function draw() {
    const W = canvas.width;
    const H = canvas.height;
    ctx.clearRect(0, 0, W, H);
    if (!caption && !status) {
      texture.needsUpdate = true;
      return;
    }
    const capPx = Math.round(H * 0.2);
    const statPx = Math.round(H * 0.12);
    ctx.font = `400 ${capPx}px ${FONT}`;
    const lines = wrapLines(caption, W * 0.92, (t) => ctx.measureText(t).width, 3);
    const lineH = capPx * 1.3;
    const blockH = lines.length * lineH + (status ? statPx * 1.6 : 0);
    // Ink backing so the text reads against any room; 4 px corners at canvas scale.
    ctx.fillStyle = ink;
    ctx.globalAlpha = 0.82;
    const pad = capPx * 0.5;
    const top = Math.max(0, (H - blockH) / 2 - pad);
    roundRect(ctx, 0, top, W, Math.min(H, blockH + pad * 2) , 12);
    ctx.fill();
    ctx.globalAlpha = 1;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    let y = top + pad + lineH / 2;
    ctx.fillStyle = paper;
    for (const l of lines) {
      ctx.fillText(l, W / 2, y);
      y += lineH;
    }
    if (status) {
      ctx.font = `400 ${statPx}px ${FONT}`;
      ctx.fillStyle = dusk;
      ctx.fillText(wrapLines(status, W * 0.92, (t) => ctx.measureText(t).width, 1)[0] ?? "", W / 2, y - lineH / 2 + statPx * 1.3);
    }
    texture.needsUpdate = true;
  }

  return {
    mesh,
    setCaption(text) {
      if (text === caption) return;
      caption = text || "";
      draw();
    },
    setStatus(text) {
      if (text === status) return;
      status = text || "";
      draw();
    },
  };
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}
