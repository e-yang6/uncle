import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { createApp } from "./index.js";

test("xr/ is served at /xr and head/builds/ at /head/builds; missing files are 404", async () => {
  const dir = mkdtempSync(path.join(tmpdir(), "uncle-static-"));
  mkdirSync(path.join(dir, "xr"));
  mkdirSync(path.join(dir, "builds", "maya"), { recursive: true });
  writeFileSync(path.join(dir, "xr", "index.html"), "<title>headset</title>");
  writeFileSync(path.join(dir, "builds", "maya", "head.glb"), Buffer.from("glTF"));
  const server = createApp({ xrDir: path.join(dir, "xr"), headsDir: path.join(dir, "builds") }).listen(0, "127.0.0.1");
  await new Promise((resolve, reject) => (server.once("listening", resolve), server.once("error", reject)));
  try {
    const base = `http://127.0.0.1:${server.address().port}`;
    const page = await fetch(`${base}/xr/`);
    assert.equal(page.status, 200);
    assert.match(await page.text(), /headset/);
    const head = await fetch(`${base}/head/builds/maya/head.glb`);
    assert.equal(head.status, 200);
    assert.equal(Buffer.from(await head.arrayBuffer()).toString(), "glTF");
    assert.equal((await fetch(`${base}/head/builds/nobody/head.glb`)).status, 404);
    assert.equal((await fetch(`${base}/head/builds/../../package.json`)).status, 404, "no walking out of the folder");
    assert.equal((await fetch(`${base}/health`)).status, 200, "the rest of the server still works");
  } finally {
    server.close();
    rmSync(dir, { recursive: true, force: true });
  }
});
