#!/usr/bin/env node
// Fetches current CPP, OAS, TFSA and RRSP values from Canada.ca
// and saves them to sim/rates.json with source URLs and timestamps.
// Run at app startup; falls back to the last saved copy.
//
// Usage: node sim/fetch-rates.js

import { writeFileSync, readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const here = path.dirname(fileURLToPath(import.meta.url));
const RATES_PATH = path.join(here, "rates.json");

const SOURCES = {
  cpp: {
    url: "https://www.canada.ca/en/services/benefits/publicpensions/cpp/cpp-benefit/amount.html",
    description: "CPP maximum monthly retirement pension at age 65",
  },
  oas: {
    url: "https://www.canada.ca/en/services/benefits/publicpensions/cpp/old-age-security/payments.html",
    description: "OAS maximum monthly payment (age 65-74)",
  },
  tfsa: {
    url: "https://www.canada.ca/content/canadasite/en/revenue-agency/services/tax/individuals/topics/tax-free-savings-account/contributing/calculate-room.html",
    description: "TFSA annual dollar limit",
  },
  rrsp: {
    url: "https://www.canada.ca/en/revenue-agency/services/tax/registered-plans-administrators/pspa/mp-rrsp-dpsp-tfsa-limits-ympe.html",
    description: "RRSP annual dollar limit",
  },
};

async function fetchPage(url) {
  const res = await fetch(url, {
    headers: { "User-Agent": "Uncle-Hackathon-App/1.0" },
    signal: AbortSignal.timeout(10_000),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status} from ${url}`);
  return await res.text();
}

function extractNumber(html, patterns) {
  for (const pat of patterns) {
    const m = html.match(pat);
    if (m) {
      const raw = m[1].replace(/[,$]/g, "");
      const val = parseFloat(raw);
      if (!isNaN(val) && val > 0) return val;
    }
  }
  return null;
}

async function fetchCPP() {
  const html = await fetchPage(SOURCES.cpp.url);
  return extractNumber(html, [
    /maximum[^<]*?(?:pension|CPP)[^<]*?age\s*65[^<]*?\$\s*([\d,]+(?:\.\d+)?)/i,
    /\$\s*([\d,]+\.\d{2})[^<]*?maximum/i,
    /Maximum[^<]*?\$\s*([\d,]+(?:\.\d+)?)/i,
  ]);
}

async function fetchOAS() {
  const html = await fetchPage(SOURCES.oas.url);
  return extractNumber(html, [
    /Maximum monthly payment.*?\$\s*([\d,]+(?:\.\d+)?)/is,
    /65 to 74.*?\$\s*([\d,]+(?:\.\d+)?)/is,
    /\$\s*(7[\d]{2}\.\d{2})/,
  ]);
}

async function fetchTFSA() {
  const html = await fetchPage(SOURCES.tfsa.url);
  return extractNumber(html, [
    /TFSA[^<]*?(?:dollar|contribution)\s+limit[^<]*?\$\s*([\d,]+)/i,
    /\$\s*([\d,]+)[^<]*?(?:TFSA|annual)/i,
  ]);
}

async function fetchRRSP() {
  const html = await fetchPage(SOURCES.rrsp.url);
  return extractNumber(html, [
    /2026[^<]*?RRSP[^<]*?\$\s*([\d,]+)/i,
    /RRSP dollar limit[^<]*?\$\s*([\d,]+)/i,
    /\$\s*(3[\d],[\d]{3})/,
  ]);
}

const HARDCODED_FALLBACK = {
  cpp_max_monthly: 1507.65,
  oas_max_monthly: 762.50,
  tfsa_annual_limit: 7000,
  rrsp_annual_max: 33810,
  rrsp_rate: 0.18,
  cpp_contrib_years_full: 39,
  fetched_at: "2026-11-21T08:00:00Z",
  sources: SOURCES,
  note: "Verified 2026 values from Canada.ca, November 2026",
};

// Sanity bounds — reject values outside plausible ranges
const BOUNDS = {
  cpp_max_monthly: [1000, 2500],
  oas_max_monthly: [500, 1500],
  tfsa_annual_limit: [5000, 15000],
  rrsp_annual_max: [25000, 50000],
};

export async function fetchRates() {
  const rates = { ...HARDCODED_FALLBACK };
  const errors = [];

  const fetchers = [
    { key: "cpp_max_monthly", fn: fetchCPP, label: "CPP" },
    { key: "oas_max_monthly", fn: fetchOAS, label: "OAS" },
    { key: "tfsa_annual_limit", fn: fetchTFSA, label: "TFSA" },
    { key: "rrsp_annual_max", fn: fetchRRSP, label: "RRSP" },
  ];

  const results = await Promise.allSettled(fetchers.map(f => f.fn()));
  for (let i = 0; i < fetchers.length; i++) {
    const { key, label } = fetchers[i];
    const result = results[i];
    if (result.status === "fulfilled" && result.value !== null) {
      const [lo, hi] = BOUNDS[key] || [0, Infinity];
      if (result.value >= lo && result.value <= hi) {
        rates[key] = result.value;
      } else {
        errors.push(`${label}: fetched ${result.value} outside bounds [${lo}, ${hi}], using fallback ${rates[key]}`);
      }
    } else {
      const reason = result.status === "rejected" ? result.reason.message : "pattern not found";
      errors.push(`${label}: ${reason}, using fallback ${rates[key]}`);
    }
  }

  rates.fetched_at = new Date().toISOString();
  rates.sources = SOURCES;
  if (errors.length > 0) rates.fetch_errors = errors;

  writeFileSync(RATES_PATH, JSON.stringify(rates, null, 2));
  return { rates, errors };
}

export function loadRates() {
  if (existsSync(RATES_PATH)) {
    try {
      return JSON.parse(readFileSync(RATES_PATH, "utf8"));
    } catch {
      // fall through to fallback
    }
  }
  return HARDCODED_FALLBACK;
}

if (import.meta.url === `file:///${process.argv[1].replace(/\\/g, "/")}` ||
    process.argv[1]?.endsWith("fetch-rates.js")) {
  fetchRates().then(({ rates, errors }) => {
    console.log("Rates saved to", RATES_PATH);
    console.log("  CPP max monthly:", rates.cpp_max_monthly);
    console.log("  OAS max monthly:", rates.oas_max_monthly);
    console.log("  TFSA annual limit:", rates.tfsa_annual_limit);
    console.log("  RRSP annual max:", rates.rrsp_annual_max);
    console.log("  Fetched at:", rates.fetched_at);
    if (errors.length > 0) {
      console.log("  Errors:", errors.join("; "));
    }
  }).catch(e => {
    console.error("Fetch failed:", e.message);
    console.log("Using hardcoded fallback values.");
    writeFileSync(RATES_PATH, JSON.stringify(HARDCODED_FALLBACK, null, 2));
  });
}
