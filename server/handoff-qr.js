import express from "express";
import QRCode from "qrcode";
import { randomBytes } from "node:crypto";

export function handoffQrRoutes({ encode = (url) => QRCode.toBuffer(url, { type: "png", width: 280, margin: 4, errorCorrectionLevel: "M", color: { dark: "#15130F", light: "#F3EEE4" } }) } = {}) {
  const router = express.Router();
  const pairings = new Map(), limits = new Map();
  const lifetime = 10 * 60000;
  function targetUrl(value, req) {
    if (typeof value !== "string" || value.length > 2000) throw new Error();
    const url = new URL(value);
    if (!["http:", "https:"].includes(url.protocol) || url.host !== req.get("host") || url.pathname !== "/xr/" || url.username || url.password || url.hash) throw new Error();
    return url;
  }
  router.use("/pairings", (req, res, next) => {
    res.set("Cache-Control", "no-store");
    const now = Date.now();
    for (const [key, value] of pairings) if (value.expires <= now) pairings.delete(key);
    for (const [key, value] of limits) if (value.expires <= now) limits.delete(key);
    const key = req.socket.remoteAddress;
    if (!limits.has(key) && limits.size >= 1000) return res.status(429).json({error:"Please try again shortly."});
    const limit = limits.get(key) ?? {count:0, expires:now + 60000};
    limits.set(key, limit);
    if (++limit.count > 60) return res.status(429).json({error:"Please try again in a minute."});
    next();
  });
  router.post("/pairings", express.json({limit:"3kb"}), (req, res) => {
    let target;
    try { target = targetUrl(req.body?.url, req); }
    catch { return res.status(400).json({error:"Choose a headset link on this app."}); }
    if (pairings.size >= 1000) return res.status(429).json({error:"Please try again shortly."});
    const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
    let code;
    do { code = Array.from(randomBytes(8), byte => alphabet[byte % alphabet.length]).join(""); } while (pairings.has(code));
    const expires = Date.now() + lifetime;
    pairings.set(code, {url:target.pathname + target.search, expires});
    res.status(201).json({code, expiresAt:new Date(expires).toISOString()});
  });
  router.get("/pairings/:code", (req, res) => {
    const code = req.params.code.toUpperCase().replace(/[\s-]/g, "");
    const pairing = /^[A-Z2-9]{8}$/.test(code) && pairings.get(code);
    if (!pairing) return res.status(404).json({error:"Code not found or expired. Get a new code on your other screen."});
    res.json({url:pairing.url});
  });
  router.get("/handoff-qr", async (req, res) => {
    res.set("Cache-Control", "no-store");
    let target;
    try {
      if (typeof req.query.url !== "string" || req.query.url.length > 2000) throw new Error();
      target = new URL(req.query.url);
      if (!["http:", "https:"].includes(target.protocol) || target.host !== req.get("host") ||
          target.pathname !== "/xr/" || target.username || target.password || target.hash) throw new Error();
    } catch { return res.status(400).json({ error: "Choose a headset link on this app." }); }
    try { res.type("png").send(await encode(target.href)); }
    catch (err) {
      console.error("[handoff-qr]", err.message);
      res.status(503).json({ error: "QR code unavailable. Use the direct headset link." });
    }
  });
  return router;
}
