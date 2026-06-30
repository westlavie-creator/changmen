import assert from "node:assert/strict";
import { it } from "vitest";
import {
  accountMultiplyScale,
  accountsMultiplyNeedsPersist,
  normalizeAccountList,
  PB_MULTIPLY_DEFAULT,
  resolveAccountMultiply,
  scaleVenueMoney,
  venueStakeFromBetMoney,
} from "./account_multiply.js";

it("pB multiply defaults to 10", () => {
  assert.equal(resolveAccountMultiply("PB", undefined), PB_MULTIPLY_DEFAULT);
  assert.equal(resolveAccountMultiply("PB", 1), PB_MULTIPLY_DEFAULT);
  assert.equal(resolveAccountMultiply("PB", 5), 5);
});

it("Polymarket multiply defaults to 10", () => {
  assert.equal(resolveAccountMultiply("Polymarket", undefined), PB_MULTIPLY_DEFAULT);
  assert.equal(resolveAccountMultiply("Polymarket", 1), PB_MULTIPLY_DEFAULT);
  assert.equal(resolveAccountMultiply("Polymarket", 8), 8);
});

it("non-multiply-provider defaults to 1", () => {
  assert.equal(resolveAccountMultiply("RAY", undefined), 1);
  assert.equal(resolveAccountMultiply("OB", 0), 1);
});

it("venue stake and scale helpers mirror PB logic", () => {
  assert.equal(venueStakeFromBetMoney(100, 10), 10);
  assert.equal(venueStakeFromBetMoney(5, 10), 7);
  assert.equal(venueStakeFromBetMoney(40, 10, 5), 5);
  assert.equal(venueStakeFromBetMoney(30, 10, 5), 5);
  assert.equal(scaleVenueMoney(12.34, 10), 123.4);
  assert.equal(accountMultiplyScale(undefined), 1);
});

it("normalizeAccountList migrates multiply-provider rows", () => {
  const out = normalizeAccountList([
    { accountId: 1, provider: "PB", multiply: 1 },
    { accountId: 2, provider: "Polymarket", multiply: 1 },
    { accountId: 3, provider: "RAY" },
  ]);
  assert.equal((out[0] as Record<string, unknown>).multiply, 10);
  assert.equal((out[1] as Record<string, unknown>).multiply, 10);
  assert.equal((out[2] as Record<string, unknown>).multiply, undefined);
  assert.equal(
    accountsMultiplyNeedsPersist([{ provider: "PB", multiply: 1 }], out),
    true,
  );
});
