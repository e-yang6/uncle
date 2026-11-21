// Interview -> simulation fields (PLAN.md Part 1, "Getting inputs from the interview").
// Gemini reads the interview (as audio or as a transcript) with structured output and fills in
// ONLY what the person actually said. Anything not mentioned stays null; our code, not the
// model, applies the documented defaults and flags them, so the confirm screen can show
// "assumed" values honestly. Output shape = CONTRACTS.md "Interview fields".

const API = "https://generativelanguage.googleapis.com/v1beta/models";
export const DEFAULT_MODEL = "gemini-3.5-flash-lite"; // same answers as 3.5-flash in our check, about 5x faster

const SYSTEM = `You fill in a form from a short interview with a young Canadian about their money and health habits.
Rules:
- Use ONLY what the person clearly said. If something was not said, return null. Never guess, estimate or assume.
- Never infer sex from the person's name or voice. Only fill "sex" if they say it themselves.
- Convert to the units asked: income_per_year in dollars per YEAR, saving_per_month in dollars per MONTH. Do the arithmetic only when the person gave the numbers (for example "$1200 a year" is 100 a month). If you would have to guess hours or weeks, return null.
- saving_per_month is money the person puts aside each month (or each year, divided by 12). It is NOT a balance: never copy it into tfsa, rrsp or other_savings. Those three are only what they say they ALREADY HAVE saved. If they say they have nothing saved, other_savings is 0.
- "30k" is 30000. Savings amounts are dollars now, split by account (tfsa, rrsp, other_savings) only if they said which; money with no account named goes in other_savings.
- province is the two-letter Canadian code (ON, BC, QC...). exercise_per_week is workouts per week. sleep_hours is hours per night. drinks_per_week is alcoholic drinks per week. smoker is true only if they smoke or vape nicotine now.
- "transcript" is a clean word-for-word transcript of what was said.`;

const nullable = (type, extra = {}) => ({ type, nullable: true, ...extra });
const SCHEMA = {
  type: "OBJECT",
  properties: {
    transcript: { type: "STRING" },
    name: nullable("STRING"),
    age: nullable("INTEGER"),
    sex: nullable("STRING", { enum: ["male", "female"] }),
    province: nullable("STRING"),
    income_per_year: nullable("NUMBER"),
    tfsa: nullable("NUMBER"),
    rrsp: nullable("NUMBER"),
    other_savings: nullable("NUMBER"),
    saving_per_month: nullable("NUMBER"),
    retirement_age: nullable("INTEGER"),
    exercise_per_week: nullable("NUMBER"),
    sleep_hours: nullable("NUMBER"),
    smoker: nullable("BOOLEAN"),
    drinks_per_week: nullable("NUMBER"),
  },
  required: ["transcript"],
};

const PROVINCES = ["AB", "BC", "MB", "NB", "NL", "NS", "NT", "NU", "ON", "PE", "QC", "SK", "YT"];
// Sanity ranges. Anything outside is rejected (set to null) and reported, never passed on.
const RANGES = {
  age: [13, 100],
  income_per_year: [0, 5_000_000],
  tfsa: [0, 50_000_000],
  rrsp: [0, 50_000_000],
  other_savings: [0, 50_000_000],
  saving_per_month: [0, 100_000],
  retirement_age: [40, 80],
  exercise_per_week: [0, 21],
  sleep_hours: [2, 14],
  drinks_per_week: [0, 100],
};

// Raw model output -> contract-shaped fields (nulls kept) + a list of values we refused.
export function normalize(raw = {}) {
  const rejected = [];
  const num = (key) => {
    const v = raw[key];
    if (v === null || v === undefined) return null;
    const [lo, hi] = RANGES[key];
    if (typeof v !== "number" || !Number.isFinite(v) || v < lo || v > hi) {
      rejected.push(key);
      return null;
    }
    return v;
  };
  const age = num("age");
  const retirement_age = num("retirement_age");
  let province = typeof raw.province === "string" ? raw.province.trim().toUpperCase() : null;
  if (province && !PROVINCES.includes(province)) (rejected.push("province"), (province = null));
  const sex = raw.sex === "male" || raw.sex === "female" ? raw.sex : null;
  const name = typeof raw.name === "string" && raw.name.trim() ? raw.name.trim().replace(/[{}]/g, "").slice(0, 40) : null;
  const smoker = typeof raw.smoker === "boolean" ? raw.smoker : null;
  if (age !== null && retirement_age !== null && retirement_age <= age) rejected.push("retirement_age");

  return {
    rejected,
    fields: {
      name,
      age,
      sex,
      province,
      income_per_year: num("income_per_year"),
      savings: { tfsa: num("tfsa"), rrsp: num("rrsp"), other: num("other_savings") },
      saving_per_month: num("saving_per_month"),
      retirement_age: age !== null && retirement_age !== null && retirement_age <= age ? null : retirement_age,
      habits: {
        exercise_per_week: num("exercise_per_week"),
        sleep_hours: num("sleep_hours"),
        smoker,
        drinks_per_week: num("drinks_per_week"),
      },
    },
  };
}

// PLAN.md Part 1 defaults. Where the plan's default is "typical for your age/sex/habits"
// (income, sex, habits) we leave null: the simulation supplies those from its own data.
const DEFAULTS = { age: 20, province: "ON", saving_per_month: 0, retirement_age: 65, savings: { tfsa: 0, rrsp: 0, other: 0 } };

export function withDefaults(fields) {
  const assumed = [];
  const pick = (path, value, fallback) => {
    if (value === null || value === undefined) {
      assumed.push(path);
      return fallback;
    }
    return value;
  };
  const profile = {
    name: pick("name", fields.name, null),
    age: pick("age", fields.age, DEFAULTS.age),
    sex: pick("sex", fields.sex, null),
    province: pick("province", fields.province, DEFAULTS.province),
    income_per_year: pick("income_per_year", fields.income_per_year, null),
    savings: {
      tfsa: pick("savings.tfsa", fields.savings.tfsa, DEFAULTS.savings.tfsa),
      rrsp: pick("savings.rrsp", fields.savings.rrsp, DEFAULTS.savings.rrsp),
      other: pick("savings.other", fields.savings.other, DEFAULTS.savings.other),
    },
    saving_per_month: pick("saving_per_month", fields.saving_per_month, DEFAULTS.saving_per_month),
    retirement_age: pick("retirement_age", fields.retirement_age, DEFAULTS.retirement_age),
    habits: {
      exercise_per_week: pick("habits.exercise_per_week", fields.habits.exercise_per_week, null),
      sleep_hours: pick("habits.sleep_hours", fields.habits.sleep_hours, null),
      smoker: pick("habits.smoker", fields.habits.smoker, null),
      drinks_per_week: pick("habits.drinks_per_week", fields.habits.drinks_per_week, null),
    },
  };
  return { profile, assumed };
}

// Ask Gemini. Give it either { transcript } or { audio: Buffer, mime }.
export async function extractFields({
  transcript,
  audio,
  mime = "audio/webm",
  apiKey = process.env.GEMINI_API_KEY,
  model = process.env.GEMINI_MODEL || DEFAULT_MODEL,
  fetchFn = fetch,
}) {
  if (!apiKey) throw new Error("interview reading is off: set GEMINI_API_KEY");
  if (!transcript && !audio) throw new Error("nothing to read: send a transcript or a recording");

  const parts = audio
    ? [{ text: "Here is the interview recording. Fill in the form." }, { inline_data: { mime_type: mime.split(";")[0], data: Buffer.from(audio).toString("base64") } }]
    : [{ text: `Here is the interview transcript:\n\n${transcript}\n\nFill in the form.` }];

  const res = await fetchFn(`${API}/${model}:generateContent`, {
    method: "POST",
    headers: { "x-goog-api-key": apiKey, "content-type": "application/json" },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: SYSTEM }] },
      contents: [{ role: "user", parts }],
      generationConfig: { responseMimeType: "application/json", responseSchema: SCHEMA, temperature: 0 },
    }),
  });
  if (!res.ok) throw new Error(`Gemini ${res.status}: ${(await res.text()).slice(0, 300)}`);
  const body = await res.json();
  const text = body?.candidates?.[0]?.content?.parts?.map((p) => p.text ?? "").join("");
  let raw;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new Error("Gemini did not return readable fields");
  }
  const { fields, rejected } = normalize(raw);
  const { profile, assumed } = withDefaults(fields);
  return { transcript: transcript ?? String(raw.transcript ?? ""), heard: fields, profile, assumed, rejected };
}
