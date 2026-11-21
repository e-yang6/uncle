// Aging the head in the headset: one apparent age drives grey hair, older skin and a softer
// lower face together (PLAN.md Part 3: aging only one of them looks creepy).
//
// Everything is placed in a "face frame" taken from the two eyeballs, so it fits any head the
// builder makes: origin between the eyes, axes as the template's (x across the eyes, y up,
// z out of the face), unit = distance between the eye centres. Rough landmarks in that unit (template proportions):
// brow +0.35, hairline about +1.0, nose tip -0.7, mouth -1.15, chin -1.9, ears at |x| 1.15.
//
// The amounts are a look, tuned by eye; Uncle never says them. The apparent age itself comes
// from the simulation (facts sheet apparent_age_at_70).
// No three.js import here, so the maths runs under node --test.

const YOUNG = 25; // nothing changes at or below this apparent age
const OLD = 85; // fully aged look

// 0 at YOUNG, 1 at OLD, smooth at both ends.
export function ageStrength(age) {
  const a = Number(age);
  if (!Number.isFinite(a)) return 0;
  const t = Math.min(1, Math.max(0, (a - YOUNG) / (OLD - YOUNG)));
  return t * t * (3 - 2 * t);
}

// Build the face frame from the two eye centres ([x, y, z] in the skin mesh's own space).
// The template's face looks down +z with +y up.
export function faceFrame(eyeA, eyeB) {
  const origin = eyeA.map((v, i) => (v + eyeB[i]) / 2);
  const unit = Math.hypot(eyeA[0] - eyeB[0], eyeA[1] - eyeB[1], eyeA[2] - eyeB[2]);
  return { origin, unit: unit > 1e-9 ? unit : 1 };
}

export function toFace(p, frame) {
  return [(p[0] - frame.origin[0]) / frame.unit, (p[1] - frame.origin[1]) / frame.unit, (p[2] - frame.origin[2]) / frame.unit];
}

const smoothstep = (a, b, x) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

// Where hair can be (before the colour check): above the hairline, the sides above the ears,
// and the back of the head above the neck. Mirrors HAIR_POS in the shader below.
export function hairZone([x, y, z]) {
  const top = smoothstep(0.8, 1.1, y);
  const sides = smoothstep(1.0, 1.25, Math.abs(x)) * smoothstep(-0.2, 0.2, y);
  const back = smoothstep(-0.8, -1.2, z) * smoothstep(-1.0, -0.6, y);
  return Math.max(top, sides, back);
}

// The lower cheeks and jaw line that sag a little with age. Mirrors JOWL in the shader.
export function jowlZone([x, y, z]) {
  return smoothstep(-0.75, -1.15, y) * smoothstep(-2.1, -1.7, y) * smoothstep(0.35, 0.7, Math.abs(x)) * smoothstep(1.25, 0.95, Math.abs(x)) * smoothstep(-0.9, -0.4, z);
}

// Cheek patch used to measure the person's skin tone from the texture.
export function cheekZone([x, y, z]) {
  return Math.abs(Math.abs(x) - 0.62) < 0.18 && y < -0.35 && y > -0.85 && z > 0;
}

// Per-channel median of [r, g, b] colours (0..1), or null for none.
export function medianColor(colors) {
  if (!colors.length) return null;
  return [0, 1, 2].map((c) => {
    const v = colors.map((p) => p[c]).sort((a, b) => a - b);
    const m = v.length >> 1;
    return v.length % 2 ? v[m] : (v[m - 1] + v[m]) / 2;
  });
}

export const srgbToLinear = (c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);

// Shape amounts, in face units at full strength.
export const SAG = 0.05; // jowls and lower cheeks drop about 3 mm on a typical face
export const LIP_THIN = 0.22; // lips pulled this fraction towards the mouth line

// GLSL ------------------------------------------------------------------------------------
// Vertex: rest-pose face coordinates (so wrinkles stick to the skin and the masks don't move
// when the mouth opens), then the age shape offsets added after the morph targets.
export const VERTEX_PARS = /* glsl */ `
uniform float uAge;
uniform vec3 uFaceOrigin;
uniform float uFaceUnit;
varying vec3 vFaceQ;
float ageSS(float a, float b, float x) { float t = clamp((x - a) / (b - a), 0.0, 1.0); return t * t * (3.0 - 2.0 * t); } // GLSL smoothstep is undefined when a > b
`;

export const VERTEX_MAIN = /* glsl */ `
{
  vec3 q = (position - uFaceOrigin) / uFaceUnit;
  vFaceQ = q;
  float ax = abs(q.x);
  float jowl = ageSS(-0.75, -1.15, q.y) * ageSS(-2.1, -1.7, q.y) * ageSS(0.35, 0.7, ax) * ageSS(1.25, 0.95, ax) * ageSS(-0.9, -0.4, q.z);
  float lips = ageSS(0.5, 0.3, ax) * ageSS(-1.45, -1.3, q.y) * ageSS(-0.85, -1.0, q.y) * ageSS(0.2, 0.5, q.z);
  transformed.y -= uAge * ${SAG.toFixed(3)} * uFaceUnit * jowl;
  transformed.y -= uAge * ${LIP_THIN.toFixed(3)} * (q.y + 1.15) * uFaceUnit * lips;
}
`;

export const FRAGMENT_PARS = /* glsl */ `
uniform float uAge;
uniform vec3 uSkinTone;
varying vec3 vFaceQ;
float ageSS(float a, float b, float x) { float t = clamp((x - a) / (b - a), 0.0, 1.0); return t * t * (3.0 - 2.0 * t); } // GLSL smoothstep is undefined when a > b
float ageHash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float ageNoise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(ageHash(i), ageHash(i + vec2(1, 0)), u.x), mix(ageHash(i + vec2(0, 1)), ageHash(i + vec2(1, 1)), u.x), u.y);
}
float ageLine(float d, float w) { return 1.0 - ageSS(0.0, w, abs(d)); }
float ageSeg(vec2 p, vec2 a, vec2 b) {
  vec2 pa = p - a, ba = b - a;
  float h = clamp(dot(pa, ba) / dot(ba, ba), 0.0, 1.0);
  return length(pa - ba * h);
}
`;

// Runs after the texture is read into diffuseColor (linear colour).
export const FRAGMENT_MAIN = /* glsl */ `
if (uAge > 0.0) {
  vec3 q = vFaceQ;
  float ax = abs(q.x);
  vec3 c = diffuseColor.rgb;
  float lum = dot(c, vec3(0.2126, 0.7152, 0.0722));
  float skinLum = max(dot(uSkinTone, vec3(0.2126, 0.7152, 0.0722)), 1e-3);

  // Hair: in the hair zone and darker than the skin. Grey comes in strand by strand.
  float zone = max(max(ageSS(0.8, 1.1, q.y), ageSS(1.0, 1.25, ax) * ageSS(-0.2, 0.2, q.y)), ageSS(-0.8, -1.2, q.z) * ageSS(-1.0, -0.6, q.y));
  float hair = zone * ageSS(0.85, 0.55, lum / skinLum);
  float strand = ageNoise(vec2(q.x * 180.0 + q.z * 60.0, q.y * 18.0));
  float greyShare = ageSS(0.15, 0.9, uAge);
  float grey = hair * ageSS(strand - 0.08, strand + 0.08, greyShare);
  vec3 greyCol = mix(vec3(0.42, 0.41, 0.39), vec3(0.62, 0.61, 0.58), strand) * (0.75 + 0.5 * lum / skinLum);
  c = mix(c, greyCol, grey * 0.9);

  // Skin: a little less colour, a little sallow, faint age spots, then lines.
  float skin = 1.0 - hair;
  float face = skin * ageSS(-0.6, -0.2, q.z);
  c = mix(c, vec3(lum), 0.18 * uAge * skin);
  c *= mix(vec3(1.0), vec3(1.0, 0.96, 0.88), uAge * skin);
  float spots = ageSS(0.78, 0.9, ageNoise(q.xy * 14.0 + 3.1)) * ageSS(0.4, 0.7, ageNoise(q.xy * 3.0));
  c *= 1.0 - spots * 0.22 * uAge * face * vec3(0.8, 1.0, 1.25);

  float lines = 0.0;
  // forehead: gently wavy horizontal lines
  float fh = ageSS(0.4, 0.5, q.y) * ageSS(0.95, 0.8, q.y) * ageSS(0.85, 0.6, ax);
  lines += fh * ageLine(fract(q.y * 7.0 + 0.12 * sin(q.x * 4.0)) - 0.5, 0.06) * 0.8;
  // crow's feet: short rays from the outer eye corners
  vec2 corner = vec2(sign(q.x) * 0.72, 0.0);
  vec2 d = q.xy - corner;
  float ray = ageLine(fract(atan(d.y, abs(d.x)) * 2.2) - 0.5, 0.12);
  lines += ray * ageSS(0.05, 0.12, length(d)) * ageSS(0.32, 0.18, length(d)) * step(0.72, ax) * 0.7;
  // lines from the sides of the nose to the mouth corners
  float nl = ageSeg(vec2(ax, q.y), vec2(0.3, -0.62), vec2(0.5, -1.18));
  lines += ageLine(nl, 0.035) * 0.9;
  // soft shadow under the eyes
  lines += ageSS(0.12, 0.0, length(vec2((ax - 0.5) * 0.7, q.y + 0.28))) * 0.6;
  c *= 1.0 - clamp(lines, 0.0, 1.0) * 0.22 * ageSS(0.2, 1.0, uAge) * face;

  diffuseColor.rgb = c;
}
`;
