// The future self's free-form words, written by Gemini (PLAN.md Part 2's named fallback until the
// fine-tuned model exists). Gemini may write feelings and colour, but every fact about money,
// health or age must be a {placeholder}. We check each sentence ourselves (checkSentence) and the
// caller fills the placeholders with Ethan's fillPlaceholders(), so an invented number is rejected.
const API = "https://generativelanguage.googleapis.com/v1beta/models";
const DEFAULT_MODEL = "gemini-3.5-flash-lite";

// Number words that would be an invented fact. "one" is allowed ("one thing"), and so is "seventy": it is the premise (you at 70), not a claim.
const NUMBER_WORDS = /\b(two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen|twenty|thirty|forty|fifty|sixty|eighty|ninety|hundred|thousand|million|billion|dozen|dozens|couple)\b/i;

// Flatten the facts sheet into {placeholder} names the model may use.
export function placeholderKeys(facts) {
  const keys = [];
  const walk = (obj, prefix) => {
    for (const [k, v] of Object.entries(obj ?? {})) {
      if (k === "sources") continue;
      const path = prefix ? `${prefix}.${k}` : k;
      if (v && typeof v === "object" && !Array.isArray(v)) walk(v, path);
      else if (typeof v === "number" || typeof v === "string") keys.push(path);
    }
  };
  walk(facts, "");
  return keys;
}

// A sentence is acceptable if it has no digits or number words outside placeholders and only known placeholders.
export function checkSentence(sentence, facts) {
  if (typeof sentence !== "string" || !sentence.trim()) return false;
  const known = new Set(placeholderKeys(facts));
  for (const m of sentence.matchAll(/\{([^}]*)\}/g)) if (!known.has(m[1])) return false;
  const outside = sentence.replace(/\{[^}]*\}/g, " ");
  if (/\d/.test(outside)) return false;
  if (NUMBER_WORDS.test(outside)) return false;
  return true;
}

function systemPrompt(name, keys) {
  return `You are ${name || "the user"} at age 70, talking warmly to your younger self, who is sitting across from you in a mirror. You are the same person, just older. Speak in first person, naturally, in 1 to 3 short sentences, as in a relaxed conversation.

Rules, no exceptions:
- Answer what they actually asked. Feelings, memories, wisdom and small colour ("I still walk every morning") are welcome.
- NEVER write any digit and NEVER write a number as a word (no "two", "twenty", "hundred", no years, no ages, no amounts). "one" is fine in phrases like "one thing".
- Any fact about money, savings, income, health, life expectancy or age MUST be one of these placeholders, written exactly with braces: ${keys.map((k) => `{${k}}`).join(", ")}. Never write a placeholder not on that list. Use a placeholder only when it fits the question.
- If asked about family, jobs, houses, or other facts you have no placeholder for, answer in feelings and values without claiming specifics.
- Never say when or how they will die. Be warm, never scary or guilt-tripping. Talk about options and choices, not fear.
- Reply as JSON only: {"sentences": ["...", "..."]}`;
}

// history: [{role: "you"|"future", text}] oldest first.
export async function writeReply({ question, history = [], facts, name, apiKey = process.env.GEMINI_API_KEY, model = process.env.GEMINI_MODEL || DEFAULT_MODEL, fetchFn = fetch }) {
  if (!apiKey) throw new Error("chat is off: set GEMINI_API_KEY");
  const keys = placeholderKeys(facts);
  const contents = [
    ...history.map((h) => ({ role: h.role === "you" ? "user" : "model", parts: [{ text: h.text }] })),
    { role: "user", parts: [{ text: question }] },
  ];
  const res = await fetchFn(`${API}/${model}:generateContent`, {
    method: "POST",
    headers: { "x-goog-api-key": apiKey, "content-type": "application/json" },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: systemPrompt(name, keys) }] },
      contents,
      generationConfig: {
        responseMimeType: "application/json",
        responseSchema: { type: "OBJECT", properties: { sentences: { type: "ARRAY", items: { type: "STRING" } } }, required: ["sentences"] },
        temperature: 0.8,
        maxOutputTokens: 300,
      },
    }),
  });
  if (!res.ok) throw new Error(`Gemini ${res.status}`);
  const body = await res.json();
  const text = body?.candidates?.[0]?.content?.parts?.[0]?.text;
  const sentences = JSON.parse(text ?? "{}").sentences;
  if (!Array.isArray(sentences)) throw new Error("Gemini returned no sentences");
  return sentences.map(String).slice(0, 4);
}
