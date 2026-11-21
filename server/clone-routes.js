// HTTP routes for voice clones.
//   POST   /api/voice/clone?name=Jeffrey   body = the recording (any audio type). Makes a clone.
//   GET    /api/voice/clones               who has a saved clone (names only, no voice ids)
//   DELETE /api/voice/clones/:name         delete the clone at ElevenLabs and our saved copy
import express from "express";
import { createClone, deleteClone, extensionFor } from "../voice/clone.js";
import { createStore, slug } from "../voice/store.js";

const MIN_BYTES = 20_000; // anything smaller is under a second or two: too short to clone
const MAX_BYTES = 25 * 1024 * 1024;

export function cloneRoutes({ store = createStore(), createFn = createClone, deleteFn = deleteClone } = {}) {
  const router = express.Router();

  router.post("/clone", express.raw({ type: () => true, limit: MAX_BYTES }), async (req, res) => {
    const name = String(req.query.name ?? "").trim();
    if (!slug(name)) return res.status(400).json({ error: "Please enter a name." });
    const audio = req.body;
    if (!Buffer.isBuffer(audio) || audio.length < MIN_BYTES) {
      return res.status(400).json({ error: "That recording is too short. Please record at least 30 seconds." });
    }
    const mime = req.get("content-type") || "audio/webm";
    try {
      // Replace an older clone for the same name, so we never pile up unused voices.
      const old = store.find(name);
      if (old) await deleteFn({ voiceId: old.voiceId }).catch(() => {});
      store.saveRecording({ name, audio, ext: extensionFor(mime) });
      const { voiceId } = await createFn({ name, audio, mime });
      const saved = store.save({ name, voiceId });
      res.json({ name: saved.name, createdAt: saved.createdAt });
    } catch (err) {
      const off = /voice is off/.test(err.message);
      res.status(off ? 503 : 502).json({ error: err.message });
    }
  });

  router.get("/clones", (_req, res) => {
    res.json(store.list().map(({ name, createdAt }) => ({ name, createdAt })));
  });

  router.delete("/clones/:name", async (req, res) => {
    const found = store.find(req.params.name);
    if (!found) return res.status(404).json({ error: "No saved voice with that name." });
    try {
      await deleteFn({ voiceId: found.voiceId });
      store.remove(req.params.name);
      store.deleteProfile(req.params.name); // "delete my voice" means all of it
      store.deleteRecordings(req.params.name);
      res.json({ deleted: found.name });
    } catch (err) {
      res.status(502).json({ error: err.message });
    }
  });

  return router;
}
