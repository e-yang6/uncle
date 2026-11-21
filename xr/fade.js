// How visible a chart panel is, by seconds since it arrived: fades in, stays, fades out.
export const FADE_IN = 0.4;
export const HOLD = 20; // long enough to read and to grab it
export const FADE_OUT = 1.2;

export function panelOpacity(t) {
  if (!(t >= 0)) return 0;
  if (t < FADE_IN) return t / FADE_IN;
  if (t < FADE_IN + HOLD) return 1;
  return Math.max(0, 1 - (t - FADE_IN - HOLD) / FADE_OUT);
}
