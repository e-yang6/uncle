// STAND-IN for the future self's words, until Ethan's fine-tuned model (PLAN.md Part 2) exists.
// It picks a canned reply by keyword. Every number is a placeholder that Ethan's
// fillPlaceholders() fills from the facts sheet, so this can never say a number the
// simulation didn't produce. Replace answer() with the model call later; nothing else changes.
import { fillPlaceholders } from "../sim/facts.js";
import { writeReply, checkSentence } from "../voice/chat.js";

// Templates contain NO raw numbers, only {placeholders}. humanNumber() now prints plain "$420,000", so the template adds the word "about" (once).
// Warm, never scary (PLAN.md tone rules).
const REPLIES = [
  {
    match: /house|home|buy|afford/i,
    sentences: [
      "I can't promise you a house, but I can tell you what I had to work with.",
      "By seventy I had about {savings_70.median} put away, and that gave me real choices.",
    ],
  },
  {
    match: /money|save|saving|savings|rich|broke|retire|okay with/i,
    sentences: [
      "We were okay, and honestly, better than okay on a good run.",
      "By seventy I had about {savings_70.median} put away, and about {income_retired_per_year.median} a year coming in.",
      "{one_change.label} is the thing that made the difference, so start there.",
    ],
  },
  {
    match: /health|healthy|live|long|old|age|exercise|sleep/i,
    sentences: [
      "I'm feeling good for my age, thanks for asking.",
      "People with your habits, on average, live to between {life_expectancy.low} and {life_expectancy.high}, and stay healthy until around {healthy_years.median}.",
      "That's a population estimate, not a promise, and the habits you pick now move it.",
    ],
  },
  {
    match: /change|start|should|advice|do now|next/i,
    sentences: ["If you do one thing, do this.", "{one_change.label}.", "It's small, and it adds up more than you'd think."],
  },
];

const DEFAULT_REPLY = [
  "Hello, it's me, from a long way down the road.",
  "Ask me about money, my health, or what I'd change, and I'll tell you what I know.",
];

// The greeting at the start of a session. It says the person's name, which is plain text
// from the interview (not a fact from the simulation), so it is added after the template.
export function greeting(name) {
  const clean = String(name ?? "").replace(/[{}]/g, "").trim().slice(0, 40);
  return [
    clean ? `Hello ${clean}, it's me, from a long way down the road.` : DEFAULT_REPLY[0],
    "I've been looking forward to this. Ask me anything.",
  ];
}

// Safe line with no facts in it, used if a template ever fails the checker.
const SAFE_FALLBACK = "I'd rather not guess on that one. Ask me another way?";

export function answer(question, facts) {
  const entry = REPLIES.find((r) => r.match.test(question)) ?? { sentences: DEFAULT_REPLY };
  return entry.sentences.map((template) => {
    const filled = fillPlaceholders(template, facts);
    // A filled label can open a sentence ("saving $50 more a month"), so capitalize the start.
    return filled.ok ? filled.text.charAt(0).toUpperCase() + filled.text.slice(1) : SAFE_FALLBACK;
  });
}

// Free-form reply: Gemini writes it (placeholders only), we check and fill it. One rewrite if a
// sentence fails the check, then the keyword answer above. Never throws.
// Returns { sentences, source: "gemini" | "template" }.
export async function reply(question, facts, { history = [], name = "", writeFn = writeReply } = {}) {
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const drafts = await writeFn({ question, history, facts, name });
      if (drafts.length && drafts.every((d) => checkSentence(d, facts))) {
        const filled = drafts.map((d) => fillPlaceholders(d, facts));
        if (filled.every((f) => f.ok)) {
          return { source: "gemini", sentences: filled.map((f) => f.text.charAt(0).toUpperCase() + f.text.slice(1)) };
        }
      }
    } catch {
      break; // key missing, network or API error: no point retrying
    }
  }
  return { source: "template", sentences: answer(question, facts) };
}
