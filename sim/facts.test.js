import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { getFacts, fillPlaceholders } from "./facts.js";

describe("getFacts", () => {
  it("returns a facts sheet matching the contract schema", () => {
    const f = getFacts();
    assert.ok(f.savings_70.median > 0);
    assert.ok(f.life_expectancy.median > 0);
    assert.ok(f.money_lasts_to_90_chance > 0 && f.money_lasts_to_90_chance <= 1);
    assert.ok(f.one_change.slider);
    assert.ok(f.one_change.label);
    assert.ok(Array.isArray(f.sources));
  });
});

describe("fillPlaceholders", () => {
  const facts = getFacts();

  it("fills a valid placeholder with a human-readable value", () => {
    const r = fillPlaceholders("I had about {savings_70.median} saved.", facts);
    assert.equal(r.ok, true);
    assert.ok(r.text.includes("$420,000"), `got: ${r.text}`);
    assert.ok(!r.text.includes("{"));
  });

  it("fills percentage values", () => {
    const r = fillPlaceholders("There's a {money_lasts_to_90_chance} chance.", facts);
    assert.equal(r.ok, true);
    assert.ok(r.text.includes("72%"), `got: ${r.text}`);
  });

  it("fills nested one_change fields", () => {
    const r = fillPlaceholders("The best change is {one_change.label}.", facts);
    assert.equal(r.ok, true);
    assert.ok(r.text.includes("Saving $50 more a month"));
  });

  it("rejects unknown placeholders", () => {
    const r = fillPlaceholders("You have {fake_field.foo} dollars.", facts);
    assert.equal(r.ok, false);
    assert.equal(r.error, "unknown_placeholder");
    assert.deepEqual(r.keys, ["fake_field.foo"]);
  });

  it("rejects raw numbers in the output", () => {
    const r = fillPlaceholders("You saved 420000 dollars.", facts);
    assert.equal(r.ok, false);
    assert.equal(r.error, "raw_number");
  });

  it("allows small numbers that aren't financial figures", () => {
    const r = fillPlaceholders("You exercised {habits_note} times.", facts);
    assert.equal(r.ok, false);
    assert.equal(r.error, "unknown_placeholder");
  });

  it("handles templates with no placeholders", () => {
    const r = fillPlaceholders("I still go walking every morning.", facts);
    assert.equal(r.ok, true);
    assert.equal(r.text, "I still go walking every morning.");
  });

  it("handles multiple placeholders in one template", () => {
    const r = fillPlaceholders(
      "I had {savings_70.median} and lived to about {life_expectancy.median}.",
      facts
    );
    assert.equal(r.ok, true);
    assert.ok(r.text.includes("$420,000"));
    assert.ok(r.text.includes("82"));
  });
});
