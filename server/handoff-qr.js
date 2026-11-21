import express from "express";
import QRCode from "qrcode";

export function handoffQrRoutes({ encode = (url) => QRCode.toBuffer(url, { type: "png", width: 280, margin: 4, errorCorrectionLevel: "M", color: { dark: "#15130F", light: "#F3EEE4" } }) } = {}) {
  const router = express.Router();
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
