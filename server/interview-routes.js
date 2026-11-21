// HTTP routes for the interview and the "did we get this right?" screen.
//   POST /api/interview/extract   body = a recording (audio/*) OR JSON {transcript}. Returns what Gemini heard.
//   POST /api/interview/confirm   JSON {name, profile}. Saves the person's corrected answers.
//   GET  /api/profile/:name       the saved, confirmed profile (what the simulation reads).
import express from "express";
import { extractFields, normalize, withDefaults } from "../voice/interview.js";
import { createStore } from "../voice/store.js";

const MAX_BYTES = 25 * 1024 * 1024;
const MIN_AUDIO_BYTES = 20_000;

export function interviewRoutes({ store = createStore(), extractFn = extractFields } = {}) {
  const router = express.Router();

  router.post("/interview/extract", express.raw({ type: () => true, limit: MAX_BYTES }), async (req, res) => {
    const type = (req.get("content-type") || "").split(";")[0];
    try {
      let input;
      if (type === "application/json") {
        const { transcript } = JSON.parse(req.body.toString() || "{}");
        if (!String(transcript ?? "").trim()) return res.status(400).json({ error: "The transcript is empty." });
        input = { transcript: String(transcript).slice(0, 8000) };
      } else {
        if (!Buffer.isBuffer(req.body) || req.body.length < MIN_AUDIO_BYTES) {
          return res.status(400).json({ error: "That recording is too short to read." });
        }
        input = { audio: req.body, mime: req.get("content-type") || "audio/webm" };
      }
      res.json(await extractFn(input));
    } catch (err) {
      const off = /is off/.test(err.message);
      res.status(off ? 503 : 502).json({ error: err.message });
    }
  });

  router.post("/interview/confirm", express.json({ limit: "50kb" }), (req, res) => {
    const name = String(req.body?.name ?? "").trim();
    if (!name) return res.status(400).json({ error: "A name is needed." });
    // Re-check whatever the browser sends: the confirm screen lets people type, so don't trust it.
    const p = req.body?.profile ?? {};
    const flat = {
      name,
      age: p.age,
      sex: p.sex,
      province: p.province,
      income_per_year: p.income_per_year,
      tfsa: p.savings?.tfsa,
      rrsp: p.savings?.rrsp,
      other_savings: p.savings?.other,
      saving_per_month: p.saving_per_month,
      retirement_age: p.retirement_age,
      exercise_per_week: p.habits?.exercise_per_week,
      sleep_hours: p.habits?.sleep_hours,
      smoker: p.habits?.smoker,
      drinks_per_week: p.habits?.drinks_per_week,
    };
    const { fields, rejected } = normalize(flat);
    if (rejected.length) return res.status(400).json({ error: `These values look wrong: ${rejected.join(", ")}`, rejected });
    const { profile, assumed } = withDefaults(fields);
    store.saveProfile(name, profile);
    res.json({ profile, assumed });
  });

  router.get("/profile/:name", (req, res) => {
    const saved = store.getProfile(req.params.name);
    if (!saved) return res.status(404).json({ error: "No saved profile with that name." });
    res.json(saved);
  });

  return router;
}
