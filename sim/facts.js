import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const here = path.dirname(fileURLToPath(import.meta.url));

let cachedFacts = null;

export function getFacts() {
  if (!cachedFacts) {
    cachedFacts = JSON.parse(
      readFileSync(path.join(here, "fake-facts.json"), "utf8")
    );
  }
  return cachedFacts;
}

function resolve(facts, key) {
  const parts = key.split(".");
  let val = facts;
  for (const p of parts) {
    if (val == null || typeof val !== "object" || !(p in val)) return undefined;
    val = val[p];
  }
  return val;
}

function humanNumber(val) {
  if (typeof val === "boolean") return val ? "yes" : "no";
  if (typeof val === "string") return val;
  if (typeof val !== "number") return String(val);
  if (val >= 1_000_000) return `about $${(val / 1_000_000).toFixed(1)} million`;
  if (val >= 1000) return `about $${Math.round(val / 1000).toLocaleString("en-CA")},000`;
  if (val > 0 && val < 1) return `${Math.round(val * 100)}%`;
  return String(Math.round(val));
}

const PLACEHOLDER_RE = /\{([a-z0-9_]+(?:\.[a-z0-9_]+)*)\}/g;
const RAW_NUMBER_RE = /(?<!\{[\w.]*)\b\d{2,}\b(?![\w.]*\})/;

export function fillPlaceholders(template, facts) {
  if (RAW_NUMBER_RE.test(template)) {
    return { ok: false, error: "raw_number", text: template };
  }

  const unknown = [];

  const filled = template.replace(PLACEHOLDER_RE, (_match, key) => {
    const val = resolve(facts, key);
    if (val === undefined) {
      unknown.push(key);
      return `{${key}}`;
    }
    return humanNumber(val);
  });

  if (unknown.length > 0) {
    return { ok: false, error: "unknown_placeholder", keys: unknown, text: filled };
  }

  return { ok: true, text: filled };
}
