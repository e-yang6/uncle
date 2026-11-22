// Four backdrops painted onto a canvas, one per wealth tier (CONTRACTS.md "Look tiers"): a small tidy room, a cosy living
// room, a bright home with a garden view, a grand estate. Flat shapes in tints of the four design colours, no gradients
// beyond a soft sky, no shadows. No three.js, so the painting runs under node --test with a fake context.
import { PALETTE, mix } from "./looks-data.js";

const { ink, paper, dusk } = PALETTE;
const W = 1024;
const H = 768;
export const BACKDROP_SIZE = { w: W, h: H };

const rect = (ctx, color, x, y, w, h) => { ctx.fillStyle = color; ctx.fillRect(x, y, w, h); };
const circle = (ctx, color, x, y, r) => { ctx.fillStyle = color; ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill(); };
const poly = (ctx, color, pts) => { ctx.fillStyle = color; ctx.beginPath(); pts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y))); ctx.closePath(); ctx.fill(); };

function window4(ctx, x, y, w, h, frame, glass) {
  rect(ctx, frame, x - 10, y - 10, w + 20, h + 20);
  rect(ctx, glass, x, y, w, h);
  rect(ctx, frame, x + w / 2 - 4, y, 8, h);
  rect(ctx, frame, x, y + h / 2 - 4, w, 8);
}

const SCENES = {
  // 1 Modest: a small, tidy, lived-in room.
  1(ctx) {
    rect(ctx, mix(paper, dusk, 0.3), 0, 0, W, H);
    rect(ctx, mix(dusk, ink, 0.2), 0, 600, W, 168); // floor
    rect(ctx, mix(paper, dusk, 0.55), 0, 590, W, 14); // skirting
    window4(ctx, 110, 150, 230, 280, mix(paper, dusk, 0.6), mix(paper, dusk, 0.1));
    rect(ctx, mix(dusk, ink, 0.1), 70, 130, 40, 330); // curtain
    rect(ctx, mix(paper, dusk, 0.55), 700, 150, 190, 230); // picture frame
    rect(ctx, mix(paper, dusk, 0.15), 716, 166, 158, 198);
    poly(ctx, mix(dusk, ink, 0.35), [[716, 364], [780, 270], [820, 320], [850, 285], [874, 364]]);
    rect(ctx, mix(dusk, ink, 0.3), 560, 500, 60, 100); // pot
    for (const [x, y, r] of [[590, 470, 38], [555, 495, 30], [625, 495, 30], [590, 430, 26]]) circle(ctx, mix(dusk, ink, 0.45), x, y, r);
  },
  // 2 Comfortable: a cosy living room with a window.
  2(ctx) {
    rect(ctx, mix(paper, dusk, 0.35), 0, 0, W, H);
    rect(ctx, mix(dusk, ink, 0.3), 0, 610, W, 158);
    rect(ctx, mix(paper, dusk, 0.6), 0, 600, W, 14);
    window4(ctx, 560, 120, 330, 300, mix(paper, dusk, 0.65), mix(paper, dusk, 0.05));
    rect(ctx, mix(paper, dusk, 0.5), 540, 430, 370, 16); // sill
    rect(ctx, mix(dusk, ink, 0.5), 70, 90, 250, 510); // bookshelf
    for (let r = 0; r < 4; r++) {
      rect(ctx, mix(dusk, ink, 0.65), 80, 190 + r * 105, 230, 8);
      for (let i = 0; i < 9; i++) rect(ctx, mix(paper, dusk, 0.25 + ((i * 7 + r * 3) % 5) * 0.12), 90 + i * 24, 120 + r * 105 + ((i * 5) % 3) * 8, 18, 68 - ((i * 5) % 3) * 8);
    }
    rect(ctx, mix(dusk, ink, 0.4), 380, 520, 560, 90); // sofa back
    rect(ctx, mix(dusk, ink, 0.28), 380, 570, 560, 40);
    rect(ctx, mix(dusk, ink, 0.4), 700, 470, 6, 130); // floor lamp
    poly(ctx, mix(paper, dusk, 0.2), [[670, 470], [740, 470], [725, 420], [685, 420]]);
  },
  // 3 Established: a bright open home, garden through a wide window.
  3(ctx) {
    rect(ctx, mix(paper, dusk, 0.15), 0, 0, W, H);
    rect(ctx, mix(paper, dusk, 0.45), 0, 640, W, 128); // light floor
    const gx = 90, gy = 70, gw = 844, gh = 540;
    rect(ctx, mix(paper, dusk, 0.05), gx, gy, gw, gh); // sky
    rect(ctx, mix(paper, dusk, 0.3), gx, gy + 300, gw, gh - 300); // lawn
    poly(ctx, mix(dusk, ink, 0.1), [[gx, gy + 300], [gx + 200, gy + 230], [gx + 420, gy + 290], [gx + 620, gy + 220], [gx + gw, gy + 280], [gx + gw, gy + 320], [gx, gy + 320]]); // hills
    for (const [x, y, r] of [[250, 330, 60], [330, 350, 44], [760, 320, 70], [690, 360, 46]]) { rect(ctx, mix(dusk, ink, 0.55), x - 5, y, 10, 110); circle(ctx, mix(dusk, ink, 0.4), x, y, r); }
    for (let i = 1; i < 4; i++) rect(ctx, mix(ink, dusk, 0.4), gx + (gw * i) / 4 - 5, gy, 10, gh); // mullions
    rect(ctx, mix(ink, dusk, 0.4), gx - 10, gy - 10, gw + 20, 12);
    rect(ctx, mix(ink, dusk, 0.4), gx - 10, gy + gh - 2, gw + 20, 12);
  },
  // 4 Affluent: a grand house in the distance, framed by tall drapes.
  4(ctx) {
    const sky = ctx.createLinearGradient ? ctx.createLinearGradient(0, 0, 0, 520) : null;
    if (sky) { sky.addColorStop(0, mix(paper, dusk, 0.3)); sky.addColorStop(1, mix(paper, dusk, 0.05)); }
    ctx.fillStyle = sky || mix(paper, dusk, 0.15);
    ctx.fillRect(0, 0, W, 520);
    rect(ctx, mix(paper, dusk, 0.3), 0, 520, W, 248); // lawn
    poly(ctx, mix(paper, dusk, 0.12), [[470, 768], [554, 768], [532, 540], [492, 540]]); // drive
    const house = mix(dusk, ink, 0.3), light = mix(paper, dusk, 0.35);
    rect(ctx, house, 250, 330, 524, 210); // main block
    rect(ctx, house, 150, 380, 110, 160); // wings
    rect(ctx, house, 764, 380, 110, 160);
    poly(ctx, mix(dusk, ink, 0.45), [[400, 330], [624, 330], [512, 250]]); // pediment
    for (let i = 0; i < 5; i++) rect(ctx, light, 420 + i * 46, 340, 14, 200); // columns
    for (let r = 0; r < 2; r++) for (let i = 0; i < 3; i++) { rect(ctx, light, 280 + i * 42, 360 + r * 80, 26, 50); rect(ctx, light, 686 + i * 42 - 0, 360 + r * 80, 26, 50); }
    for (const x of [175, 220, 790, 835]) rect(ctx, mix(paper, dusk, 0.5), x, 420, 22, 40);
    rect(ctx, mix(paper, dusk, 0.5), 440, 540, 144, 14); // steps
    for (const x of [120, 904]) { rect(ctx, mix(dusk, ink, 0.55), x - 5, 470, 10, 70); circle(ctx, mix(dusk, ink, 0.4), x, 450, 46); }
    for (const x of [380, 644]) circle(ctx, mix(dusk, ink, 0.45), x, 570, 28); // topiary
    rect(ctx, mix(ink, dusk, 0.12), 0, 0, 90, H); // drapes
    rect(ctx, mix(ink, dusk, 0.12), W - 90, 0, 90, H);
    rect(ctx, mix(ink, dusk, 0.28), 90, 0, 10, H);
    rect(ctx, mix(ink, dusk, 0.28), W - 100, 0, 10, H);
  },
};

// Paint one tier's backdrop, with a soft dark edge so it reads as a picture rather than a hard rectangle.
export function paintBackdrop(ctx, tier) {
  ctx.clearRect(0, 0, W, H);
  (SCENES[tier] ?? SCENES[2])(ctx);
  if (ctx.createRadialGradient) {
    const g = ctx.createRadialGradient(W / 2, H / 2, H * 0.45, W / 2, H / 2, H * 0.95);
    g.addColorStop(0, "rgba(21,19,15,0)");
    g.addColorStop(1, "rgba(21,19,15,0.55)");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
  }
  return true;
}
