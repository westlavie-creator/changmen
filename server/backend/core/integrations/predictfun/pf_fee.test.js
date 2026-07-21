import { describe, expect, it } from "vitest";
import { extractPfFeeFromOfficial, resolvePfFeeSavePatch } from "./pf_fee.js";
import { pfFeeAmountWeiToUsdt } from "./pf_wallet_events_parse.js";

describe("pf_fee", () => {
  it("converts COLLATERAL wei to USDT", () => {
    expect(pfFeeAmountWeiToUsdt("2000000000000000000", "COLLATERAL")).toBe(2);
    expect(pfFeeAmountWeiToUsdt("2000000000000000000", "SHARES")).toBeUndefined();
  });

  it("extracts fee from pfWalletFee stub", () => {
    const fee = extractPfFeeFromOfficial({
      pfWalletFee: { amountWei: "1500000000000000000", type: "COLLATERAL" },
    });
    expect(fee.amountWei).toBe("1500000000000000000");
    expect(fee.usdt).toBe(1.5);
  });

  it("prefers official fee then keeps rds fee", () => {
    expect(resolvePfFeeSavePatch({
      pfWalletFee: { amountWei: "1000000000000000000", type: "COLLATERAL" },
    }, null)).toEqual({
      pfFeeAmountWei: "1000000000000000000",
      pfFeeType: "COLLATERAL",
      pfFeeUsdt: 1,
    });
    expect(resolvePfFeeSavePatch({}, {
      pfFeeAmountWei: "3000000000000000000",
      pfFeeType: "COLLATERAL",
      pfFeeUsdt: 3,
    })).toEqual({
      pfFeeAmountWei: "3000000000000000000",
      pfFeeType: "COLLATERAL",
      pfFeeUsdt: 3,
    });
  });
});
