import { describe, expect, it } from "vitest";
import {
  computePfHoldShares,
  extractPfFeeFromOfficial,
  resolvePfFeeSavePatch,
} from "./pf_fee.js";
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

  it("computes hold shares = fill − SHARES fee", () => {
    expect(computePfHoldShares({
      pfShares: 44.125,
      pfFeeType: "SHARES",
      pfFeeAmountWei: "794250000000000000",
    })).toBeCloseTo(43.33075, 8);
    expect(computePfHoldShares({
      pfShares: 44.125,
      pfFeeType: "COLLATERAL",
      pfFeeAmountWei: "1000000000000000000",
    })).toBe(44.125);
  });

  it("prefers official fee then keeps rds fee; writes pfHoldShares", () => {
    expect(resolvePfFeeSavePatch({
      pfWalletFee: { amountWei: "1000000000000000000", type: "COLLATERAL" },
    }, null, { pfShares: 10 })).toEqual({
      pfFeeAmountWei: "1000000000000000000",
      pfFeeType: "COLLATERAL",
      pfFeeUsdt: 1,
      pfHoldShares: 10,
    });
    expect(resolvePfFeeSavePatch({}, {
      pfFeeAmountWei: "3000000000000000000",
      pfFeeType: "COLLATERAL",
      pfFeeUsdt: 3,
      pfShares: 20,
    })).toEqual({
      pfFeeAmountWei: "3000000000000000000",
      pfFeeType: "COLLATERAL",
      pfFeeUsdt: 3,
      pfHoldShares: 20,
    });
    const withSharesFee = resolvePfFeeSavePatch({
      pfWalletFee: { amountWei: "794250000000000000", type: "SHARES" },
    }, null, { pfShares: 44.125 });
    expect(withSharesFee.pfFeeType).toBe("SHARES");
    expect(withSharesFee.pfHoldShares).toBeCloseTo(43.33075, 8);
  });
});
