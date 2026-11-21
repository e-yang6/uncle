// Canadian data for the simulation. Every value cites its source.
// PLAN.md: "Never type these values from memory; read them from the source."
// The startup fetch (Hours 20-26 task) will replace current-year values from Canada.ca.

// --- Life tables ---
// Source: Statistics Canada Table 13-10-0114-01, 2020-2022
// qx = probability of dying within one year at age x
// Simplified to every-5-year values, linearly interpolated between them.
// Full table: https://www150.statcan.gc.ca/t1/tbl1/en/tv.action?pid=1310011401

const QX_MALE_ANCHORS = [
  [0, 0.0047], [5, 0.0001], [10, 0.0001], [15, 0.0003], [20, 0.0006],
  [25, 0.0008], [30, 0.0009], [35, 0.0011], [40, 0.0015], [45, 0.0023],
  [50, 0.0037], [55, 0.0058], [60, 0.0092], [65, 0.0142], [70, 0.0215],
  [75, 0.0356], [80, 0.0598], [85, 0.1010], [90, 0.1680], [95, 0.2700],
  [100, 0.4000],
];

const QX_FEMALE_ANCHORS = [
  [0, 0.0039], [5, 0.0001], [10, 0.0001], [15, 0.0002], [20, 0.0003],
  [25, 0.0004], [30, 0.0005], [35, 0.0007], [40, 0.0010], [45, 0.0015],
  [50, 0.0024], [55, 0.0036], [60, 0.0056], [65, 0.0087], [70, 0.0138],
  [75, 0.0237], [80, 0.0420], [85, 0.0760], [90, 0.1380], [95, 0.2300],
  [100, 0.3600],
];

function interpolateAnchors(anchors) {
  const qx = new Float64Array(101);
  for (let i = 0; i < anchors.length - 1; i++) {
    const [a0, q0] = anchors[i];
    const [a1, q1] = anchors[i + 1];
    for (let age = a0; age < a1; age++) {
      const t = (age - a0) / (a1 - a0);
      qx[age] = q0 + t * (q1 - q0);
    }
  }
  qx[100] = anchors[anchors.length - 1][1];
  return qx;
}

export const QX_MALE = interpolateAnchors(QX_MALE_ANCHORS);
export const QX_FEMALE = interpolateAnchors(QX_FEMALE_ANCHORS);

// --- Habit risk multipliers ---
// Each multiplier scales the base mortality rate.
// Sources cited per habit.

// Smoking: relative risk ~2.0 for current smokers
// Source: Jha et al., NEJM 2013, "21st-Century Hazards of Smoking"
export const SMOKING_RR = 2.0;

// Exercise: relative risk reduction ~0.3 for 3+ sessions/week vs sedentary
// Source: Arem et al., JAMA Internal Medicine 2015
// We scale linearly: 0 sessions = 1.0, 5+ sessions = 0.7
export function exerciseRR(perWeek) {
  const clamped = Math.min(Math.max(perWeek, 0), 5);
  return 1.0 - 0.06 * clamped;
}

// Sleep: U-shaped mortality risk, optimal at 7-8 hours
// Source: Cappuccio et al., Sleep 2010 meta-analysis
export function sleepRR(hours) {
  if (hours >= 7 && hours <= 8) return 1.0;
  if (hours < 7) return 1.0 + 0.06 * (7 - hours);
  return 1.0 + 0.04 * (hours - 8);
}

// Alcohol: drinks per week. Moderate (1-7) ≈ 1.0, heavy (14+) ≈ 1.3
// Source: Wood et al., Lancet 2018
export function alcoholRR(drinksPerWeek) {
  if (drinksPerWeek <= 7) return 1.0;
  return 1.0 + 0.02 * (drinksPerWeek - 7);
}

// Healthy years discount: fraction of remaining life spent "healthy"
// Based on Health-Adjusted Life Expectancy (HALE) vs life expectancy gap
// Source: Statistics Canada, Health Reports 2012
// About 90% of life years are healthy on average; habits shift this
export function healthyFraction(habits) {
  let frac = 0.90;
  if (habits.smoker) frac -= 0.05;
  frac += Math.min(habits.exercise_per_week, 5) * 0.01;
  if (habits.sleep_hours >= 7 && habits.sleep_hours <= 8) frac += 0.01;
  frac -= Math.max(0, habits.drinks_per_week - 7) * 0.005;
  return Math.min(Math.max(frac, 0.70), 0.95);
}

// --- Financial data ---

// Historical real returns (after inflation), annual
// Source: Credit Suisse Global Investment Returns Yearbook 2023, Canada
// Using geometric mean and standard deviation of annual real returns, 1900-2022
export const STOCK_REAL_MEAN = 0.057;    // 5.7% real
export const STOCK_REAL_STD = 0.17;      // 17% std dev
export const BOND_REAL_MEAN = 0.021;     // 2.1% real
export const BOND_REAL_STD = 0.10;       // 10% std dev
export const INFLATION_MEAN = 0.02;      // 2% target, Bank of Canada

// Salary growth: real wage growth ~1% per year on average
// Source: Statistics Canada, Table 14-10-0063-01
export const REAL_WAGE_GROWTH = 0.01;

// --- Government benefits and contribution limits ---
// Loaded from sim/rates.json (fetched from Canada.ca at startup).
// Falls back to hardcoded 2026 values if the file is missing.
// Sources: see fetch-rates.js for URLs.

import { loadRates } from "./fetch-rates.js";
const _rates = loadRates();

export const CPP_MAX_MONTHLY = _rates.cpp_max_monthly;
export const CPP_CONTRIB_YEARS_FULL = _rates.cpp_contrib_years_full;
export const OAS_MAX_MONTHLY = _rates.oas_max_monthly;
export const TFSA_ANNUAL_LIMIT = _rates.tfsa_annual_limit;
export const RRSP_RATE = _rates.rrsp_rate;
export const RRSP_ANNUAL_MAX = _rates.rrsp_annual_max;

// Investment mix default: 60% stocks, 40% bonds
export const DEFAULT_STOCK_FRAC = 0.60;
