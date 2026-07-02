import assert from "node:assert/strict";
import { it } from "vitest";
import {
  accountMultiplyScale,
  accountsMultiplyNeedsPersist,
  normalizeAccountList,
  PB_MULTIPLY_DEFAULT,
  DEFAULT_MULTIPLY,
  preserveStoredAccountMultiply,
  resolveAccountMultiply,
  scaleVenueMoney,
  venueStakeFromBetMoney,
} from "./account_multiply.js";

it("pB multiply defaults to 1 when missing or invalid", () => {
  assert.equal(resolveAccountMultiply("PB", undefined), DEFAULT_MULTIPLY);
  assert.equal(resolveAccountMultiply("PB", 0), DEFAULT_MULTIPLY);
  assert.equal(resolveAccountMultiply("PB", 5), 5);
});

it("pB multiply keeps explicit 1", () => {
  assert.equal(resolveAccountMultiply("PB", 1), 1);
});

it("Polymarket multiply defaults to 1 when missing or invalid", () => {
  assert.equal(resolveAccountMultiply("Polymarket", undefined), DEFAULT_MULTIPLY);
  assert.equal(resolveAccountMultiply("Polymarket", 0), DEFAULT_MULTIPLY);
  assert.equal(resolveAccountMultiply("Polymarket", 8), 8);
});

it("Polymarket multiply keeps explicit 1", () => {
  assert.equal(resolveAccountMultiply("Polymarket", 1), 1);
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

it("normalizeAccountList migrates missing multiply only", () => {
  const out = normalizeAccountList([
    { accountId: 1, provider: "PB" },
    { accountId: 2, provider: "PB", multiply: 1 },
    { accountId: 3, provider: "Polymarket", multiply: 1 },
    { accountId: 4, provider: "RAY" },
  ]);
  assert.equal((out[0] as Record<string, unknown>).multiply, 1);
  assert.equal((out[1] as Record<string, unknown>).multiply, 1);
  assert.equal((out[2] as Record<string, unknown>).multiply, 1);
  assert.equal((out[3] as Record<string, unknown>).multiply, undefined);
  assert.equal(
    accountsMultiplyNeedsPersist([{ provider: "PB" }], [out[0]]),
    true,
  );
  assert.equal(
    accountsMultiplyNeedsPersist([{ provider: "PB", multiply: 1 }], [out[1]]),
    false,
  );
});

it("preserveStoredAccountMultiply keeps server multiply on save", () => {
  const kept = preserveStoredAccountMultiply(
    { accountId: 1, provider: "PB", multiply: 99 },
    { accountId: 1, multiply: 10 },
  );
  assert.equal((kept as Record<string, unknown>).multiply, 10);
  const fresh = preserveStoredAccountMultiply(
    { accountId: 2, provider: "PB", multiply: 99 },
    undefined,
  );
  assert.equal((fresh as Record<string, unknown>).multiply, 99);
});
