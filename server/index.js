import express from "express";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { featureStatus } from "./features.js";
import { speak } from "../voice/tts.js";
import { applyAging } from "../voice/filter.js";
import { agingParams } from "../voice/aging.js";
import { floatToWav } from "../voice/wav.js";

const here = path.dirname(fileURLToPath(import.meta.url));

// A test line with no money, health or age facts in it (the future self's rule).
const TEST_LINE =
  "Hello there. It's me, from a long way down the road. Things turned out better than you'd think.";

export function createApp({ speakFn = speak } = {}) {
  const app = express();
  const ttsCache = new Map(); // text -> samples, so the page's two buttons cost one API call

  app.get("/health", (_req, res) => {
    res.json({ ok: true, features: featureStatus() });
  });

  // Voice test: ElevenLabs speaks one line, our filter ages it, we return a WAV.
  //   /api/voice/test                    aged at full strength
  //   /api/voice/test?strength=0.5       half as aged
  //   /api/voice/test?raw=1              the unaged voice, for comparison
  app.get("/api/voice/test", async (req, res) => {
    const text = String(req.query.text || TEST_LINE).slice(0, 300);
    const strength = req.query.strength === undefined ? 1 : Number(req.query.strength);
    const sex = ["female", "male"].includes(req.query.sex) ? req.query.sex : "neutral";
    try {
      let tts = ttsCache.get(text);
      let cached = true;
      if (!tts) {
        cached = false;
        tts = await speakFn(text);
        ttsCache.set(text, tts);
      }
      const t0 = performance.now();
      const raw = req.query.raw === "1";
      // ?off=wobble,tone,pace,pitch switches single effects off, to find which one sounds wrong.
      const off = String(req.query.off || "").split(",");
      const params = agingParams(strength, sex);
      if (off.includes("pitch")) params.pitchSemitones = 0;
      if (off.includes("pace")) params.speed = 1;
      if (off.includes("wobble")) params.vibrato = params.tremor = 0;
      if (off.includes("tone")) params.toneCut = 0;
      const samples = raw ? tts.samples : applyAging(tts.samples, tts.sampleRate, params);
      const filterMs = Math.round(performance.now() - t0);
      res.set({
        "content-type": "audio/wav",
        "x-tts-cached": String(cached),
        "x-tts-ttfb-ms": String(tts.ttfbMs),
        "x-tts-total-ms": String(tts.totalMs),
        "x-filter-ms": String(raw ? 0 : filterMs),
        "access-control-expose-headers": "x-tts-cached, x-tts-ttfb-ms, x-tts-total-ms, x-filter-ms",
      });
      res.send(floatToWav(samples, tts.sampleRate));
    } catch (err) {
      const off = /voice is off/.test(err.message);
      res.status(off ? 503 : 502).json({ error: err.message });
    }
  });

  app.use(express.static(path.join(here, "public")));
  return app;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const port = Number(process.env.PORT) || 3000;
  createApp().listen(port, () => {
    console.log(`Uncle server listening on port ${port}`);
    for (const f of featureStatus()) {
      console.log(`  ${f.on ? "on " : "OFF"} ${f.name}${f.on ? "" : `: ${f.note} (set ${f.needs})`}`);
    }
  });
}
