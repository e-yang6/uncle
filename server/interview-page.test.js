import { test } from "node:test";
import assert from "node:assert/strict";
import { createApp } from "./index.js";

test("the interview page is served, uses the real routes, and follows the writing rules", async () => {
  const server = createApp().listen(0, "127.0.0.1");
  await new Promise((r) => server.once("listening", r));
  try {
    const res = await fetch(`http://127.0.0.1:${server.address().port}/interview.html`);
    assert.equal(res.status, 200);
    const html = await res.text();
    for (const route of ["/api/voice/clone", "/api/interview/extract", "/api/interview/confirm", "/api/head-jobs", "/xr/?"]) assert.ok(html.includes(route), route);
    assert.ok(!html.includes("—"), "no em dashes (DESIGN-RULES.md)");
    assert.ok(!/#fff(fff)?\b|#000(000)?\b/i.test(html), "no pure white or pure black");
    assert.ok(html.includes("IBM Plex Sans"));
  } finally {
    server.close();
  }
});
