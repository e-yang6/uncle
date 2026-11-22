// The newer pop-up cards from CONTRACTS.md ("More pop-up cards"): stat, habit, compare. Drawn onto a 2D canvas
// in the same simple light-panel and green style as xr/charts.js.
// Values come only from the message; this file formats and places them. No three.js, so it runs under node --test.
import { COLORS, niceMax, formatMoney, scale } from "./charts.js";
import { wrapLines } from "./wrap.js";

export const CARD_KINDS = ["stat", "habit", "compare"];
const FONT = 'Arial, "DejaVu Sans", sans-serif';

export const isCard = (c) => Boolean(c) && CARD_KINDS.includes(c.kind);

// Is the message something we can draw? Anything else is ignored, never half drawn.
export function validCard(c) {
  if (!isCard(c)) return false;
  if (c.kind === "stat") return typeof c.value === "string" && c.value.length > 0;
  const d = c.datasets?.[0]?.data;
  return Array.isArray(c.labels) && c.labels.length === 2 && Array.isArray(d) && d.length === 2 && d.every((v) => Number.isFinite(Number(v)));
}

// Money or years? Savings cards say so in the dataset label ("Savings at 70 (typical)").
export const isMoney = (c) => /sav|\$|income|money/i.test(c.datasets?.[0]?.label ?? "");
export const formatAmount = (c, v) => (isMoney(c) ? formatMoney(v) : `${Math.round(v)} years`);

// "+10 years" or "+$212k": the change from the first value to the second, signed.
export function deltaText(c) {
  const [a, b] = c.datasets[0].data.map(Number);
  const d = b - a;
  const body = isMoney(c) ? formatMoney(Math.abs(d)) : `${Math.round(Math.abs(d))} years`;
  return `${d >= 0 ? "+" : "-"}${body}`;
}

function text(ctx, s, x, y, { size, weight = 400, color, align = "left", max, spacing = 0 }) {
  ctx.font = `${weight} ${size}px ${FONT}`;
  ctx.fillStyle = color;
  ctx.textAlign = align;
  if ("letterSpacing" in ctx) ctx.letterSpacing = spacing ? `${(spacing * size).toFixed(1)}px` : "0px";
  if (max) ctx.fillText(String(s), x, y, max);
  else ctx.fillText(String(s), x, y);
  if ("letterSpacing" in ctx) ctx.letterSpacing = "0px";
}

function roundRect(ctx, x, y, w, h, r) {
  r = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

// The small print under a card, wrapped to at most two lines.
function note(ctx, b, s) {
  if (!s) return;
  ctx.font = `400 ${3.8 * b.u}px ${FONT}`;
  const lines = wrapLines(s, b.x1 - b.x0, (t) => ctx.measureText(t).width, 2);
  lines.forEach((ln, i) => text(ctx, ln, b.x0, b.y1 - (lines.length - 1 - i) * 4.8 * b.u, { size: 3.8 * b.u, color: COLORS.dusk }));
}

const DRAW = {
  // One big number with its range.
  stat(ctx, c, b) {
    const { u } = b;
    text(ctx, String(c.title || ""), b.x0, b.y0 + 4 * u, { size: 4 * u, color: COLORS.dusk, spacing: 0 });
    text(ctx, c.value, b.x0, b.y0 + 23 * u, { size: 8 * u, weight: 600, color: COLORS.ink, max: b.x1 - b.x0 });
    if (c.range) {

      text(ctx, c.range, b.x0, b.y0 + 37 * u, { size: 6 * u, weight: 600, color: COLORS.green, max: b.x1 - b.x0 });
    }
    note(ctx, b, c.range ? `Middle ${Math.round((c.coverage ?? .8)*100)}%` : c.note);
  },

  // Two values side by side: the change as the headline, a quiet bar for before, an amber bar for after.
  habit(ctx, c, b) {
    const { u } = b;
    const [a, z] = c.datasets[0].data.map(Number);
    text(ctx, String(c.title || ""), b.x0, b.y0 + 4 * u, { size: 4 * u, color: COLORS.dusk, spacing: 0 });


    const top = niceMax(Math.max(a, z));
    const rowY = [b.y0 + 22 * u, b.y0 + 42 * u];
    [[c.labels[0], a, COLORS.dusk], [c.labels[1], z, COLORS.green]].forEach(([label, v, color], i) => {
      const y = rowY[i];
      text(ctx, label, b.x0, y + 3.4 * u, { size: 4 * u, color: i === 1 ? COLORS.ink : COLORS.dusk });
      const x = b.x0 + 34 * u;
      const w = scale(v, top, 0, b.x1 - x - 24 * u);
      ctx.fillStyle = color;
      roundRect(ctx, x, y, Math.max(w, 1.2 * u), 4.2 * u, 0.6 * u);
      ctx.fill();
      text(ctx, formatAmount(c, v), x + w + 2 * u, y + 3.6 * u, { size: 4 * u, weight: i === 1 ? 600 : 400, color: i === 1 ? COLORS.ink : COLORS.dusk });
    });
    note(ctx, b, c.note);
  },
};
DRAW.compare = DRAW.habit; // same shape: two values and the change between them

// Returns false if the message can't be drawn (the panel then ignores it).
export function drawCard(ctx, card, W, H) {
  ctx.clearRect(0, 0, W, H);
  if (!validCard(card)) return false;
  const u = H / 100;
  ctx.fillStyle = COLORS.paper;
  ctx.globalAlpha = 1;
  roundRect(ctx, 0, 0, W, H, 1.2 * u); // DESIGN-RULES: small corners
  ctx.fill();
  ctx.globalAlpha = 1;
  ctx.textBaseline = "alphabetic";
  DRAW[card.kind](ctx, card, { x0: 7 * u, x1: W - 7 * u, y0: 7 * u, y1: H - 7 * u, u, W, H });
  return true;
}
