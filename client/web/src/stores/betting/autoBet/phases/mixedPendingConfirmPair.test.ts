import { describe, expect, it } from "vitest";
import {
  isInstantFreezeVenueProvider,
  isMixedPendingConfirmArbPair,
  mixedInstantIsLegA,
} from "@/stores/betting/autoBet/phases/mixedPendingConfirmPair";
import { BetOption as BetOptionClass } from "@changmen/client-core/models/betOption";

describe("isMixedPendingConfirmArbPair", () => {
  it("PM + RAY 是混合对", () => {
    expect(isMixedPendingConfirmArbPair("Polymarket", "RAY")).toBe(true);
    expect(isInstantFreezeVenueProvider("RAY")).toBe(true);
  });

  it("PF + OB 是混合对", () => {
    expect(isMixedPendingConfirmArbPair("PredictFun", "OB")).toBe(true);
  });

  it("OB + RAY 不是", () => {
    expect(isMixedPendingConfirmArbPair("OB", "RAY")).toBe(false);
  });

  it("PM + PF 不是", () => {
    expect(isMixedPendingConfirmArbPair("Polymarket", "PredictFun")).toBe(false);
  });

  it("mixedInstantIsLegA 识别即时馆在 A 或 B", () => {
    const pm = new BetOptionClass("Polymarket" as never, "m", "b", "i", 10, "Home", 1.9);
    const ray = new BetOptionClass("RAY" as never, "m", "b", "i", 10, "Away", 2.2);
    expect(mixedInstantIsLegA(ray, pm)).toBe(true);
    expect(mixedInstantIsLegA(pm, ray)).toBe(false);
  });
});

