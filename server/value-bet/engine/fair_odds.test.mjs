import { strict as assert } from "node:assert";
import { test } from "vitest";
import { removVig } from "./fair_odds.js";

test("multiplicative vig removal — symmetric odds", () => {
  const r = removVig(1.90, 1.90);
  assert.ok(r);
  assert.ok(Math.abs(r.overround - (2 / 1.90)) < 0.001);
  assert.ok(Math.abs(r.fairHome - 2.0) < 0.01);
  assert.ok(Math.abs(r.fairAway - 2.0) < 0.01);
  assert.ok(Math.abs(r.trueHomeProb - 0.5) < 0.01);
});

test("multiplicative vig removal — asymmetric odds", () => {
  const r = removVig(1.85, 2.05);
  assert.ok(r);
  // overround = 1/1.85 + 1/2.05 ≈ 1.028
  assert.ok(r.overround > 1.02 && r.overround < 1.04);
  // fair odds should be slightly higher than sharp odds
  assert.ok(r.fairHome > 1.85);
  assert.ok(r.fairAway > 2.05);
  // probabilities sum to 1
  assert.ok(Math.abs(r.trueHomeProb + r.trueAwayProb - 1.0) < 0.0001);
});

test("additive vig removal", () => {
  const r = removVig(1.90, 1.90, "additive");
  assert.ok(r);
  assert.ok(Math.abs(r.fairHome - 2.0) < 0.01);
  assert.ok(Math.abs(r.trueHomeProb + r.trueAwayProb - 1.0) < 0.0001);
});

test("invalid odds returns null", () => {
  assert.equal(removVig(0, 1.90), null);
  assert.equal(removVig(1.90, 0), null);
  assert.equal(removVig(1.0, 1.90), null);
  assert.equal(removVig(1.90, 1.0), null);
});
