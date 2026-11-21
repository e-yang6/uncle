import { test } from "node:test";
import assert from "node:assert/strict";
import express from "express";
import { handoffQrRoutes } from "./handoff-qr.js";

async function withQr(fn, options) {
  const app = express(); app.use("/api", handoffQrRoutes(options));
  const server = app.listen(0, "127.0.0.1");
  await new Promise(resolve => server.once("listening", resolve));
  try { await fn(`http://127.0.0.1:${server.address().port}`); }
  finally { await new Promise(resolve => server.close(resolve)); }
}

test("handoff generates a real PNG on our own server", async () => withQr(async base => {
  const target = base + "/xr/?voice=live&name=Test%20person&head=scan-test";
  const response = await fetch(`${base}/api/handoff-qr?${new URLSearchParams({ url: target })}`);
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type"), /image\/png/);
  assert.equal(response.headers.get("cache-control"), "no-store");
  const png = Buffer.from(await response.arrayBuffer());
  assert.equal(png.subarray(0,8).toString("hex"), "89504e470d0a1a0a");
  assert.equal(png.readUInt32BE(16), 280);
  assert.equal(png.readUInt32BE(20), 280);
}));

test("QR encodes the exact headset identity and refuses foreign or invalid links", async () => {
  let encoded;
  await withQr(async base => {
    const url = base + "/xr/?voice=live&name=Maya+%26+Mei&sex=female&head=scan-new";
    assert.equal((await fetch(`${base}/api/handoff-qr?${new URLSearchParams({url})}`)).status, 200);
    assert.equal(encoded, url);
    for (const target of ["https://example.com/xr/", base + "/heads.html", "javascript:alert(1)", base.replace("://", "://user:secret@") + "/xr/", base + "/xr/?name=" + "x".repeat(2100)]) {
      assert.equal((await fetch(`${base}/api/handoff-qr?${new URLSearchParams({url: target})}`)).status, 400);
    }
  }, { encode: async url => { encoded = url; return Buffer.from("image"); } });
});

test("QR failure has a bounded response so the page can keep its direct link", async () => withQr(async base => {
  const response = await fetch(`${base}/api/handoff-qr?${new URLSearchParams({url: base + "/xr/?name=Test"})}`);
  assert.equal(response.status, 503);
  assert.match((await response.json()).error, /direct headset link/);
}, { encode: async () => { throw new Error("synthetic encoder outage"); } }));
