import express from "express";
import { timingSafeEqual } from "node:crypto";
import { createHeadLibrary } from "./head-library.js";

export function headRoutes({ dir, token = process.env.HEAD_LIBRARY_TOKEN ?? "" }) {
  const router = express.Router();
  const library = createHeadLibrary(dir);
  router.get("/", (req, res, next) => {
    res.set("Cache-Control", "no-store");
    try { res.json({ heads: library.list(String(req.query.q ?? "").slice(0, 100)), uploadsEnabled: Boolean(token) }); }
    catch (err) { next(err); }
  });
  router.post("/", (req, res, next) => {
    res.set("Cache-Control", "no-store");
    if (!token) return res.status(503).json({ error: "Head uploads are off. Set HEAD_LIBRARY_TOKEN on the server." });
    const expected = Buffer.from(`Bearer ${token}`), actual = Buffer.from(req.get("authorization") ?? "");
    if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) {
      return res.status(401).json({ error: "Enter the team's upload key." });
    }
    if (!req.is("model/gltf-binary") && !req.is("application/octet-stream")) {
      return res.status(415).json({ error: "Upload a GLB head file." });
    }
    next();
  }, express.raw({ type: ["model/gltf-binary", "application/octet-stream"], limit: "50mb" }), (req, res, next) => {
    try { res.status(201).json(library.add(req.query.name, req.body)); }
    catch (err) {
      if (err.code) return next(err);
      res.status(400).json({ error: err.message });
    }
  });
  router.use((err, _req, res, _next) => {
    if (err.type === "entity.too.large") return res.status(413).json({ error: "Choose a GLB smaller than 50 MiB." });
    console.error("[head-library]", err.message);
    res.status(500).json({ error: "The head library could not read or save its files. Please try again." });
  });
  return router;
}
