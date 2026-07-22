import { describe, expect, it } from "vitest";
import {
  computePfHoldShares,
  computeChangmenPfFeeUsdt,
  extractPfFeeFromOfficial,
  netSellProceedsAfterChangmenFee,
  netSellProceedsAfterCollateralFee,
  resolvePfFeeSavePatch,
} from "./pf_fee.js";
import { pfFeeAmountWeiToUsdt } from "./pf_wallet_events_parse.js";

describe("pf_fee", () => {
  it("converts COLLATERAL wei to USDT", () => {
    expect(pfFeeAmountWeiToUsdt("2000000000000000000", "COLLATERAL")).toBe(2);
    expect(pfFeeAmountWeiToUsdt("2000000000000000000", "SHARES")).toBeUndefined();
  });

  it("nets sell proceeds by COLLATERAL fee only", () => {
    expect(netSellProceedsAfterCollateralFee(13.75, {
      pfFeeType: "COLLATERAL",
      pfFeeUsdt: 0.25,
    })).toBe(13.5);
    expect(netSellProceedsAfterCollateralFee(13.75, {
      pfFeeType: "SHARES",
      pfFeeAmountWei: "1000000000000000000",
    })).toBe(13.75);
    expect(netSellProceedsAfterCollateralFee(10, {
      pfFeeType: "COLLATERAL",
      pfFeeAmountWei: "1500000000000000000",
    })).toBe(8.5);
    expect(netSellProceedsAfterCollateralFee(1, {
      pfFeeType: "COLLATERAL",
      pfFeeUsdt: 2,
    })).toBe(0);
  });

  it("computes Changmencodefee by bps", () => {
    expect(computeChangmenPfFeeUsdt(100, 100)).toBe(1);
    expect(computeChangmenPfFeeUsdt(13.5, 200)).toBe(0.27);
    expect(computeChangmenPfFeeUsdt(10, 0)).toBe(0);
    expect(netSellProceedsAfterChangmenFee(13.5, 200)).toEqual({
      proceedsUsdt: 13.23,
      changmenCodeFeeUsdt: 0.27,
      changmenCodeFeeRateBps: 200,
    });
    expect(netSellProceedsAfterChangmenFee(10, 0)).toEqual({
      proceedsUsdt: 10,
      changmenCodeFeeUsdt: 0,
      changmenCodeFeeRateBps: 0,
    });
  });

  it("applies Changmencodefee buy cut as shares on hold", async () => {
    const { applyChangmenBuyFeeToHoldShares } = await import("./pf_fee.js");
    expect(applyChangmenBuyFeeToHoldShares(100, 100)).toEqual({
      holdShares: 99,
      changmenCodeFeeShares: 1,
      changmenCodeFeeRateBps: 100,
    });
    expect(applyChangmenBuyFeeToHoldShares(50, 200)).toEqual({
      holdShares: 49,
      changmenCodeFeeShares: 1,
      changmenCodeFeeRateBps: 200,
    });
  });

  it("extracts fee from pfWalletFee stub", () => {
    const fee = extractPfFeeFromOfficial({
      pfWalletFee: { amountWei: "1500000000000000000", type: "COLLATERAL" },
    });
    expect(fee.amountWei).toBe("1500000000000000000");
    expect(fee.usdt).toBe(1.5);
  });

  it("computes hold shares = fill − SHARES fee (exact wei)", () => {
    expect(computePfHoldShares({
      pfShares: 44.125,
      pfFeeType: "SHARES",
      pfFeeAmountWei: "794250000000000000",
    })).toBe(43.33075);
    expect(computePfHoldShares({
      pfSharesWei: "44125000000000000000",
      pfFeeType: "SHARES",
      pfFeeAmountWei: "794250000000000000",
    })).toBe(43.33075);
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
      pfHoldSharesWei: "10000000000000000000",
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
      pfHoldSharesWei: "20000000000000000000",
      pfHoldShares: 20,
    });
    const withSharesFee = resolvePfFeeSavePatch({
      pfWalletFee: { amountWei: "794250000000000000", type: "SHARES" },
    }, null, { pfSharesWei: "44125000000000000000", pfShares: 44.125 });
    expect(withSharesFee.pfFeeType).toBe("SHARES");
    expect(withSharesFee.pfHoldShares).toBe(43.33075);
    expect(withSharesFee.pfHoldSharesWei).toBe("43330750000000000000");
  });
});
