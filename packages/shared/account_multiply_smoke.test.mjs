import assert from "node:assert/strict";
import test from "node:test";
import {
  accountsMultiplyNeedsPersist,
  normalizeAccountList,
  PB_MULTIPLY_DEFAULT,
  resolveAccountMultiply,
} from "./account_multiply.mjs";

test("PB multiply defaults to 10", () => {
  assert.equal(resolveAccountMultiply("PB", undefined), PB_MULTIPLY_DEFAULT);
  assert.equal(resolveAccountMultiply("PB", 1), PB_MULTIPLY_DEFAULT);
  assert.equal(resolveAccountMultiply("PB", 5), 5);
});

test("non-PB multiply defaults to 1", () => {
  assert.equal(resolveAccountMultiply("RAY", undefined), 1);
  assert.equal(resolveAccountMultiply("OB", 0), 1);
});

test("normalizeAccountList migrates PB rows", () => {
  const out = normalizeAccountList([
    { accountId: 1, provider: "PB", multiply: 1 },
    { accountId: 2, provider: "RAY" },
  ]);
  assert.equal(out[0].multiply, 10);
  assert.equal(out[1].multiply, undefined);
  assert.equal(
    accountsMultiplyNeedsPersist([{ provider: "PB", multiply: 1 }], out),
    true,
  );
});
