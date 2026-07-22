import { describe, expect, it } from "vitest";
import {
  CHANGMEN_CODE_FEE,
  changmenCodeFeeSavePatch,
  readChangmenCodeFeeRateBps,
  readChangmenCodeFeeShares,
  readChangmenCodeFeeUsdt,
} from "./pf_changmen_code_fee.js";

describe("pf_changmen_code_fee", () => {
  it("exports product name Changmencodefee", () => {
    expect(CHANGMEN_CODE_FEE).toBe("Changmencodefee");
  });

  it("reads new fields preferentially, falls back to legacy", () => {
    expect(readChangmenCodeFeeRateBps({
      pfChangmenCodeFeeRateBps: 100,
      pfChangmenFeeRateBps: 50,
    })).toBe(100);
    expect(readChangmenCodeFeeShares({ pfChangmenFeeShares: 0.5 })).toBe(0.5);
    expect(readChangmenCodeFeeUsdt({ pfChangmenCodeFeeUsdt: 0.27 })).toBe(0.27);
  });

  it("writes only pfChangmenCodeFee* keys", () => {
    expect(changmenCodeFeeSavePatch({
      rateBps: 200,
      shares: 1.5,
      usdt: 0.27,
    })).toEqual({
      pfChangmenCodeFeeRateBps: 200,
      pfChangmenCodeFeeShares: 1.5,
      pfChangmenCodeFeeUsdt: 0.27,
    });
  });
});
