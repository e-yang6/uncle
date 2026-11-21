import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { createApp } from "./index.js";
import { createHeadLibrary } from "./head-library.js";

function glb(extra = {}) {
  const json = JSON.stringify({ asset: { version: "2.0" }, meshes: [{ primitives: [] }], ...extra });
  const text = Buffer.from(json.padEnd(Math.ceil(Buffer.byteLength(json) / 4) * 4, " "));
  const bytes = Buffer.alloc(20 + text.length);
  bytes.write("glTF"); bytes.writeUInt32LE(2, 4); bytes.writeUInt32LE(bytes.length, 8);
  bytes.writeUInt32LE(text.length, 12); bytes.writeUInt32LE(0x4e4f534a, 16); text.copy(bytes, 20);
  return bytes;
}

test("catalog discovers copied heads, preserves uploads after reopening, and drops missing files", () => {
  const dir = mkdtempSync(path.join(tmpdir(), "uncle-head-catalog-"));
  try {
    mkdirSync(path.join(dir, "isaac"));
    writeFileSync(path.join(dir, "isaac", "head.glb"), glb());
    mkdirSync(path.join(dir, "unfinished"));
    const library = createHeadLibrary(dir);
    assert.deepEqual(library.list().map(h => h.name), ["Isaac"]);
    const first = library.add("Isaac", glb());
    const second = library.add("Isaac", glb());
    assert.notEqual(first.id, second.id, "same-name scans never overwrite each other");
    const reopened = createHeadLibrary(dir);
    assert.equal(reopened.list("ISAAC").length, 3);
    assert.equal(reopened.list("unrelated").length, 0);
    assert.equal(reopened.list().find(h => h.id === first.id).name, "Isaac");
    const url = new URL(first.xrUrl, "https://uncle.health");
    assert.equal(url.searchParams.get("head"), first.id);
    assert.equal(url.searchParams.get("name"), "Isaac");
    rmSync(path.join(dir, "isaac", "head.glb"));
    assert.equal(reopened.list().length, 2);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test("head API protects uploads, validates files, and serves saved bytes without changing existing heads", async () => {
  const dir = mkdtempSync(path.join(tmpdir(), "uncle-head-api-"));
  const server = createApp({ headsDir: dir, headLibraryToken: "test-secret" }).listen(0, "127.0.0.1");
  await new Promise(resolve => server.once("listening", resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  const post = (body, token = "test-secret", name = "Maya & Mei") => fetch(`${base}/api/heads?${new URLSearchParams({ name })}`, {
    method: "POST", headers: { "content-type": "model/gltf-binary", authorization: `Bearer ${token}` }, body,
  });
  try {
    assert.equal((await post(glb(), "wrong")).status, 401);
    assert.equal((await post(Buffer.from("not a head"))).status, 400);
    assert.equal((await post(glb({ buffers: [{ uri: "../../secret" }] }))).status, 400);
    assert.equal((await post(glb(), "test-secret", "")).status, 400);
    const truncated = glb().subarray(0, 20);
    assert.equal((await post(truncated)).status, 400);
    const response = await post(glb());
    assert.equal(response.status, 201);
    const head = await response.json();
    assert.equal(head.name, "Maya & Mei");
    const saved = await fetch(base + head.url);
    assert.equal(saved.status, 200);
    assert.deepEqual(Buffer.from(await saved.arrayBuffer()), glb());
    const list = await (await fetch(`${base}/api/heads?q=maya`)).json();
    assert.equal(list.heads.length, 1);
    assert.equal(list.uploadsEnabled, true);
    assert.equal((await fetch(base + head.xrUrl)).status, 200);
    assert.equal((await fetch(`${base}/head/builds/.library.sqlite`)).status, 404, "catalog is never exposed as a static download");
    assert.equal((await fetch(`${base}/heads.html`)).status, 200);
  } finally {
    await new Promise(resolve => server.close(resolve));
    rmSync(dir, { recursive: true, force: true });
  }
});

test("head library still lists scans when upload key is missing", async () => {
  const dir = mkdtempSync(path.join(tmpdir(), "uncle-head-no-key-"));
  const server = createApp({ headsDir: dir, headLibraryToken: "" }).listen(0, "127.0.0.1");
  await new Promise(resolve => server.once("listening", resolve));
  const url = `http://127.0.0.1:${server.address().port}/api/heads`;
  try {
    assert.deepEqual(await (await fetch(url)).json(), { heads: [], uploadsEnabled: false });
    assert.equal((await fetch(url, { method: "POST" })).status, 503);
  } finally {
    await new Promise(resolve => server.close(resolve));
    rmSync(dir, { recursive: true, force: true });
  }
});
