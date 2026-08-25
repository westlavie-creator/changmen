import { describe, expect, it } from "vitest";
import {
  assertSignedOrderMatchesPredictAccount,
  resolvePfPredictAccountAddress,
} from "./pf_account_bind.js";

describe("pf_account_bind", () => {
  const acc = "0xC22eAe5aF78A221b8A27f217C8f37C08D530eE62";

  it("resolves predictAccount from venueMemberId or token", () => {
    expect(resolvePfPredictAccountAddress({
      venueMemberId: acc,
    })).toBe(acc.toLowerCase());
    expect(resolvePfPredictAccountAddress({
      accountData: { token: JSON.stringify({ predictAccount: acc }) },
    })).toBe(acc.toLowerCase());
  });

  it("rejects maker mismatch", () => {
    const bad = assertSignedOrderMatchesPredictAccount({
      data: { order: { maker: "0x1111111111111111111111111111111111111111" } },
    }, acc);
    expect(bad.ok).toBe(false);
    expect(String(bad.msg)).toMatch(/maker/);
  });

  it("accepts matching maker/signer", () => {
    const ok = assertSignedOrderMatchesPredictAccount({
      data: {
        order: {
          maker: acc,
          signer: acc.toLowerCase(),
        },
      },
    }, acc);
    expect(ok.ok).toBe(true);
  });
});
