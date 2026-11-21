// How much of each aging change to apply, from "how aged" (0 = none, 1 = full age 70).
//
// PROVISIONAL: these sizes are first guesses (doubled once after listening: the first version was barely audible), NOT yet checked
// against voice-aging research. PLAN.md Part 4 says to check each size against research and
// cite it before tuning. TODO(Jeffrey's Claude): research and cite each number below.

export const FULL_AGING = {
  // Chosen by ear (Jeffrey, round 3): the earlier "deep and very old" table sounded best at
  // 0.3 strength, so these are that table times 0.3. Deeper for every voice type, which departs
  // from the plan's note that men's pitch can rise slightly with age. TODO: check against research.
  female: { pitchSemitones: -1.2, speed: 0.94, vibrato: 0.012, tremor: 0.06, toneCut: 0.21 },
  male: { pitchSemitones: -0.9, speed: 0.94, vibrato: 0.012, tremor: 0.06, toneCut: 0.21 },
  // Used when sex is unknown.
  neutral: { pitchSemitones: -0.9, speed: 0.94, vibrato: 0.012, tremor: 0.06, toneCut: 0.21 },
};

// How aged the voice should be for a given apparent age. PROVISIONAL: a straight line from
// "no aging" at 30 to "full aging" at 70 (the headset's future self is 70, so that is full).
export function strengthForAge(apparentAge = 70) {
  return Math.min(1, Math.max(0, (apparentAge - 30) / 40));
}

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
