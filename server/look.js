// How the future self LOOKS, as two tiers read from the facts sheet. Never spoken, so the cut-offs are display
// choices, not claims. They were set from the simulation's own spread across 300 random young profiles
// (savings_70.median: p25 $0, p50 about $72k, p75 about $336k; healthy_years.median: p25 74, p50 77, p75 80),
// so each tier shows up for a fair share of people. Change them here only; the headset just reads 1 to 4.
export const WEALTH_BANDS = [20_000, 150_000, 400_000]; // below the first = tier 1, at or above the last = tier 4
export const HEALTH_BANDS = [72, 76, 79];

const tier = (value, bands) => (typeof value === "number" && Number.isFinite(value) ? 1 + bands.filter((b) => value >= b).length : null);

// { wealth_tier: 1..4 | null, health_tier: 1..4 | null }. null = the facts sheet did not have the number: the
// headset should then keep its middle look rather than guess.
export function lookTiers(facts) {
  return { wealth_tier: tier(facts?.savings_70?.median, WEALTH_BANDS), health_tier: tier(facts?.healthy_years?.median, HEALTH_BANDS) };
}
