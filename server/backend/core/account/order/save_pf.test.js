import { describe, expect, it } from "vitest";
import { mergePredictFunLogicalSave } from "./save_pf.js";

describe("mergePredictFunLogicalSave reject share clear", () => {
  it("reject does not restore pfSharesWei from prev and clears fill/hold", () => {
    const { raw } = mergePredictFunLogicalSave(
      { money: 0, bet_money: 29.41 },
      {
        pfShares: 42.19677,
        pfSharesWei: "42196770000000000000",
        pfHoldShares: 42.19677,
        pfNotionalUsdt: 29.41,
        pfSide: "buy",
        pfOrderHash: "0xabc",
      },
      {
        status: "reject",
        pfNotionalUsdt: 29.41,
        pfSide: "buy",
      },
      0,
      29.41,
    );
    expect(raw.pfShares).toBeUndefined();
    expect(raw.pfSharesWei).toBeUndefined();
    expect(raw.pfHoldShares).toBeUndefined();
    expect(raw.pfSide).toBe("buy");
    expect(raw.pfNotionalUsdt).toBe(29.41);
  });

  it("keeps pfUserSigned from prev when sync omits it", () => {
    const { raw } = mergePredictFunLogicalSave(
      { money: 0, bet_money: 10 },
      {
        pfUserSigned: true,
        pfSide: "buy",
        pfOrderHash: "0xabc",
      },
      {
        status: "none",
        pfSide: "buy",
        pfOrderHash: "0xabc",
      },
      0,
      10,
    );
    expect(raw.pfUserSigned).toBe(true);
  });
});
