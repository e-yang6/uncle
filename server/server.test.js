import { test } from "node:test";
import assert from "node:assert/strict";
import { featureStatus } from "./features.js";
import { createApp } from "./index.js";

test("with no keys every feature is off and says why", () => {
  const status = featureStatus({});
  assert.ok(status.length > 0);
  for (const f of status) {
    assert.equal(f.on, false);
    assert.ok(f.note, `${f.name} should explain what is off`);
  }
});

test("a key turns its feature on; a blank key does not", () => {
  const status = featureStatus({ ELEVENLABS_API_KEY: "abc", GEMINI_API_KEY: "  " });
  assert.equal(status.find((f) => f.name === "voice").on, true);
  assert.equal(status.find((f) => f.name === "gemini").on, false);
});

test("/health answers without any keys", async () => {
  // Bind to 127.0.0.1 explicitly: a bare listen(0) can share a port number with another
  // local program, and then the request reaches that program (seen as a random 404).
  const server = createApp().listen(0, "127.0.0.1");
  await new Promise((resolve, reject) => {
    server.once("listening", resolve);
    server.once("error", reject);
  });
  try {
    const { port } = server.address();
    const res = await fetch(`http://127.0.0.1:${port}/health`);
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.ok, true);
    assert.ok(Array.isArray(body.features));
  } finally {
    server.close();
  }
});
