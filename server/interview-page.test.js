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
    // The questions are required, one at a time, and every sensitive one can be answered with a tap or declined.
    assert.ok(html.includes("id=\"s-ask\""));
    for (const q of ["Do you smoke or vape?", "alcoholic drinks", "How much do you usually sleep", "How many times a week do you exercise"]) assert.ok(html.includes(q), q);
    assert.ok((html.match(/Prefer not to say/g) || []).length >= 8, "a decline option on the sensitive questions");
    assert.ok(html.includes("$(\"rec-stop\").disabled = true"), "stop stays locked until 30 s");
  } finally {
    server.close();
  }
});
