// Eye contact: where each eye should point, with a soft lag and small saccades.
// Pure math on [x, y, z] arrays so it runs in Node tests without three.js.

const len = (v) => Math.hypot(v[0], v[1], v[2]);
const norm = (v) => {
  const l = len(v) || 1;
  return [v[0] / l, v[1] / l, v[2] / l];
};
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];

// Limit dir to at most maxRad away from forward (both unit vectors), staying in their plane.
export function clampDir(forward, dir, maxRad) {
  const f = norm(forward);
  const d = norm(dir);
  const angle = Math.acos(Math.min(1, Math.max(-1, dot(f, d))));
  if (angle <= maxRad) return d;
  // Component of d perpendicular to f; if d is straight behind, there is no sensible side, look ahead.
  const c = dot(f, d);
  const side = [d[0] - f[0] * c, d[1] - f[1] * c, d[2] - f[2] * c];
  if (len(side) < 1e-6) return f;
  const perp = norm(side);
  return norm([f[0] * Math.cos(maxRad) + perp[0] * Math.sin(maxRad), f[1] * Math.cos(maxRad) + perp[1] * Math.sin(maxRad), f[2] * Math.cos(maxRad) + perp[2] * Math.sin(maxRad)]);
}

// Follows a target point with a lag (so it doesn't feel like a camera tracker) and adds
// small, fast jumps every 0.8 to 2.8 s, the way real eyes never sit perfectly still.
export function createGaze({ random = Math.random, lag = 0.25, saccade = 0.012 } = {}) {
  let point = null;
  let jitter = [0, 0, 0];
  let next = 0.5;
  let t = 0;
  return function update(target, dt) {
    t += dt;
    if (!point) point = [...target];
    const k = 1 - Math.exp(-dt / lag);
    for (let i = 0; i < 3; i++) point[i] += (target[i] - point[i]) * k;
    if (t >= next) {
      // A small offset in metres around the viewer's face: about a degree at 1 m.
      jitter = [(random() - 0.5) * 2 * saccade, (random() - 0.5) * 2 * saccade * 0.6, 0];
      next = t + 0.8 + random() * 2;
    }
    return [point[0] + jitter[0], point[1] + jitter[1], point[2] + jitter[2]];
  };
}
