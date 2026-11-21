import express from "express";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { featureStatus } from "./features.js";

const here = path.dirname(fileURLToPath(import.meta.url));

export function createApp() {
  const app = express();

  app.get("/health", (_req, res) => {
    res.json({ ok: true, features: featureStatus() });
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
