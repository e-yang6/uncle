// How the future self looks, as plain data. CONTRACTS.md "Look tiers": the server sends wealth_tier and health_tier
// (1 to 4, or null) with the facts message; null keeps the middle look. No three.js here, so it runs under node --test.
// DESIGN-RULES.md: the palette is Ink, Paper, Dusk grey and one amber accent, nothing else. Every colour below is a
// tint or shade mixed from those four, and the only amber is the single accent (the chain, top tier).

export const PALETTE = { ink: "#15130f", paper: "#f3eee4", dusk: "#8a8378", amber: "#c8893a" };

const hex = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
// t = 0 gives a, t = 1 gives b.
export function mix(a, b, t) {
  const A = hex(a), B = hex(b);
  return "#" + A.map((v, i) => Math.round(v + (B[i] - v) * t).toString(16).padStart(2, "0")).join("");
}

export const MIDDLE_TIER = 2;
// A tier from the server, or the middle look when it is missing or not 1 to 4.
export const tierOf = (v) => (Number.isInteger(v) && v >= 1 && v <= 4 ? v : MIDDLE_TIER);

const { ink, paper, dusk, amber } = PALETTE;

// One look per wealth tier. Names are for the team; the person never sees them (CONTRACTS.md).
export const LOOKS = {
  1: { name: "Modest", outfit: "knit", body: mix(dusk, ink, 0.3), trim: mix(dusk, ink, 0.15), shirt: null, chain: false },
  2: { name: "Comfortable", outfit: "cardigan", body: mix(dusk, ink, 0.5), trim: mix(dusk, ink, 0.35), shirt: mix(paper, dusk, 0.3), chain: false },
  3: { name: "Established", outfit: "blazer", body: mix(ink, dusk, 0.3), trim: mix(ink, dusk, 0.5), shirt: mix(paper, dusk, 0.18), chain: false },
  4: { name: "Affluent", outfit: "tailored", body: mix(ink, dusk, 0.12), trim: mix(ink, dusk, 0.32), shirt: mix(paper, dusk, 0.12), chain: true, accent: amber },
};

// Posture by health tier: how far the shoulders drop (metres), how narrow they sit (scale), how far the chest leans
// forward (radians). Tier 3 and 4 are upright. Kept gentle: warm, never a caricature of frailty.
export const POSTURE = {
  1: { drop: 0.03, width: 0.92, lean: 0.14 },
  2: { drop: 0.015, width: 0.96, lean: 0.07 },
  3: { drop: 0, width: 1, lean: 0 },
  4: { drop: -0.006, width: 1.03, lean: -0.03 },
};

export const lookFor = (wealth) => LOOKS[tierOf(wealth)];
export const postureFor = (health) => POSTURE[tierOf(health)];

// Move `value` toward `target` over about `seconds` (DESIGN-RULES: 300 to 500 ms, nothing bounces).
export function approach(value, target, dt, seconds = 0.4) {
  const step = dt / seconds;
  return value < target ? Math.min(target, value + step) : Math.max(target, value - step);
}
