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

test("pairing resolves the exact session across clients and refuses invalid targets", async () => withQr(async base => {
  const url = base + "/xr/?voice=live&name=Maya%20Mei&sex=female&head=isaac";
  const created = await fetch(base + "/api/pairings", {method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({url})});
  assert.equal(created.status,201);
  const {code,expiresAt} = await created.json();
  assert.match(code,/^[A-Z]{4}$/);
  assert.ok(new Date(expiresAt).getTime() > Date.now());
  for (const entry of [code,code.toLowerCase()]) {
    const resolved=await fetch(base+"/api/pairings/"+entry);
    assert.equal(resolved.status,200);
    const target = new URL((await resolved.json()).url,base);
    for (const key of ["name","head","sex","voice"]) assert.equal(target.searchParams.get(key),new URL(url).searchParams.get(key));
    assert.match(target.searchParams.get("mirror"),/^[a-f0-9]{48}$/);
    assert.equal(resolved.headers.get("cache-control"),"no-store");
  }
  assert.equal((await fetch(base+"/api/pairings/AAAAAAAA")).status,404);
  for(const target of ["https://evil.test/xr/",base+"/heads.html",base+"/xr/#secret"]) {
    assert.equal((await fetch(base+"/api/pairings",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({url:target})})).status,400);
  }
}));

test("pairing lookups are rate limited",async()=>withQr(async base=>{
  for(let i=0;i<60;i++) assert.equal((await fetch(base+"/api/pairings/AAAAAAAA")).status,404);
  assert.equal((await fetch(base+"/api/pairings/AAAAAAAA")).status,429);
}));
