// How much of each aging change to apply, from "how aged" (0 = none, 1 = full age 70).
//
// PROVISIONAL: these sizes are first guesses chosen to sound subtle, NOT yet checked
// against voice-aging research. PLAN.md Part 4 says to check each size against research and
// cite it before tuning. TODO(Jeffrey's Claude): research and cite each number below.
// Direction (per PLAN.md): women's pitch tends to drop with age, men's can rise slightly.

export const FULL_AGING = {
  female: { pitchSemitones: -1.5, speed: 0.92, vibrato: 0.012, tremor: 0.06, toneCut: 0.35 },
  male: { pitchSemitones: 0.7, speed: 0.92, vibrato: 0.012, tremor: 0.06, toneCut: 0.35 },
  // Used when sex is unknown: no pitch change, everything else the same.
  neutral: { pitchSemitones: 0, speed: 0.92, vibrato: 0.012, tremor: 0.06, toneCut: 0.35 },
};

export function agingParams(strength = 1, sex = "neutral") {
  const s = Math.min(1, Math.max(0, strength));
  const full = FULL_AGING[sex] ?? FULL_AGING.neutral;
  return {
    pitchSemitones: full.pitchSemitones * s,
    speed: 1 + (full.speed - 1) * s,
    vibrato: full.vibrato * s,
    tremor: full.tremor * s,
    toneCut: full.toneCut * s,
  };
}
