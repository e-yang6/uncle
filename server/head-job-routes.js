import express from "express";
import { timingSafeEqual } from "node:crypto";
import { createWriteStream } from "node:fs";
import { Transform } from "node:stream";
import { pipeline } from "node:stream/promises";
import { createHeadJobs, JobError, MAX_VIDEO_BYTES } from "./head-jobs.js";
import { createHeadLibrary } from "./head-library.js";

function requireKey(key, off) {
  return (req, res, next) => {
    res.set("Cache-Control", "no-store");
    if (!key) return res.status(503).json({ error: off });
    const actual = Buffer.from(req.get("authorization") ?? ""), expected = Buffer.from(`Bearer ${key}`);
    if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) return res.status(401).json({ error: "Enter the correct team key." });
    next();
  };
}

export function headJobRoutes({ dir, headsDir, token = process.env.HEAD_LIBRARY_TOKEN ?? "", workerToken = process.env.HEAD_WORKER_TOKEN ?? "", jobs = createHeadJobs(dir) }) {
  const router = express.Router();
  const library = createHeadLibrary(headsDir);
  router.get("/head-jobs/config", (_req, res) => res.set("Cache-Control", "no-store").json({ enabled: Boolean(workerToken), maxVideoBytes: MAX_VIDEO_BYTES }));
  router.post("/head-sessions", (req, res, next) => {
    res.set("Cache-Control", "no-store");
    if (!workerToken) return res.status(503).json({ error: "New scans are unavailable right now." });
    try { res.status(201).json(jobs.createSession(req.socket.remoteAddress)); } catch (err) { next(err); }
  });
  const scanAccess = read => (req, res, next) => {
    res.set("Cache-Control", "no-store");
    const actual = Buffer.from(req.get("authorization") ?? ""), expected = Buffer.from(`Bearer ${token}`);
    if (token && actual.length === expected.length && timingSafeEqual(actual, expected)) return next();
    try {
      req.scanSessionHash = jobs.authorizeSession((req.get("authorization") ?? "").replace(/^Bearer /, ""), read ? req.params.id : undefined);
      next();
    } catch (err) { next(err); }
  };
  router.get("/head-jobs/:id", scanAccess(true), (req, res, next) => {
    try { res.json(jobs.status(req.params.id)); } catch (err) { next(err); }
  });
  router.post("/head-jobs", scanAccess(false), async (req, res, next) => {
    let job;
    try {
      if (!workerToken) throw new JobError("Video builds are off. Ask the team to configure the Mac worker.", 503);
      if (Number(req.get("content-length")) > MAX_VIDEO_BYTES) throw new JobError("Choose a video smaller than 250 MiB.", 413);
      job = jobs.reserve(req.query.name, req.query.extension, req.scanSessionHash);
      let size = 0, prefix = Buffer.alloc(0);
      const limit = new Transform({ transform(chunk, _encoding, callback) {
        size += chunk.length;
        if (prefix.length < 12) prefix = Buffer.concat([prefix, chunk]).subarray(0, 12);
        callback(size > MAX_VIDEO_BYTES ? new JobError("Choose a video smaller than 250 MiB.", 413) : null, chunk);
      } });
      // Pipe separately so a validation error can send JSON before the request socket closes.
      req.pipe(limit);
      req.once("aborted", () => limit.destroy(new JobError("The video upload was interrupted.")));
      req.once("error", err => limit.destroy(err));
      await pipeline(limit, createWriteStream(jobs.videoPath(job.id, req.query.extension), { flags: "wx" }));
      const valid = req.query.extension === "webm" ? prefix.subarray(0, 4).equals(Buffer.from([0x1a,0x45,0xdf,0xa3])) : prefix.toString("ascii", 4, 8) === "ftyp";
      if (!valid) throw new JobError("Choose an original MOV, MP4, M4V or WebM video.");
      res.status(202).json({ job: jobs.uploaded(job.id) });
    } catch (err) {
      if (job) { try { jobs.uploadFailed(job.id); } catch (cleanupError) { console.error("[head-jobs] cleanup:", cleanupError.message); } }
      req.unpipe();
      req.resume();
      next(err);
    }
  });

  router.use("/head-worker", requireKey(workerToken, "The head worker is off."));
  router.post("/head-worker/claim", (_req, res, next) => {
    try { res.json(jobs.claim()); } catch (err) { next(err); }
  });
  router.get("/head-worker/:id/video", (req, res, next) => {
    try { res.sendFile(jobs.source(req.params.id, req.get("x-head-lease")), err => { if (err) next(err); }); } catch (err) { next(err); }
  });
  router.post("/head-worker/:id/progress", express.json({ limit: "2kb" }), (req, res, next) => {
    try { res.json(jobs.progress(req.params.id, req.get("x-head-lease"), req.body?.stage)); } catch (err) { next(err); }
  });
  router.post("/head-worker/:id/complete", express.raw({ type: "model/gltf-binary", limit: "50mb" }), (req, res, next) => {
    try { res.json({ job: jobs.complete(req.params.id, req.get("x-head-lease"), name => library.add(name, req.body)) }); } catch (err) { next(err); }
  });
  router.post("/head-worker/:id/fail", express.json({ limit: "2kb" }), (req, res, next) => {
    try { res.json({ job: jobs.fail(req.params.id, req.get("x-head-lease"), req.body?.reason) }); } catch (err) { next(err); }
  });
  router.use((err, _req, res, _next) => {
    if (res.headersSent) return res.end();
    if (err instanceof JobError) return res.status(err.status).json({ error: err.message });
    if (err.type === "entity.too.large") return res.status(413).json({ error: "The uploaded file is too large." });
    if (err.type === "entity.parse.failed") return res.status(400).json({ error: "Invalid build update." });
    console.error("[head-jobs]", err.message);
    res.status(500).json({ error: "The scan could not be saved or updated. Ask the team to check the builder." });
  });
  return router;
}
