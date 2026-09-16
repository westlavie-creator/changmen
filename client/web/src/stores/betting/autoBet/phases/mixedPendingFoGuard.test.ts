import { beforeEach, describe, expect, it, vi } from "vitest";
import { BetOption as BetOptionClass } from "@changmen/client-core/models/betOption";
import { mixedPendingAskAboveDetection } from "@/stores/betting/autoBet/phases/mixedPendingFoGuard";

const getEntry = vi.hoisted(() => vi.fn());

vi.mock("@/stores/oddsStore", () => ({
  useOddsStore: () => ({ getEntry }),
}));

function pmLeg(data?: Record<string, unknown>) {
  const o = new BetOptionClass("Polymarket" as never, "m1", "b1", "token-1", 10, "Home", 5);
  if (data)
    o.data = data as never;
  return o;
}

describe("mixedPendingAskAboveDetection", () => {
  beforeEach(() => {
    getEntry.mockReset();
    getEntry.mockReturnValue(undefined);
  });

  it("无 fo 放行", () => {
    expect(mixedPendingAskAboveDetection(pmLeg({
      detectionOdds: 5,
      detectionMaxPrice: 0.2,
      detectionClobPrice: 0.2,
    }))).toBeNull();
  });

  it("fo 卖一高于检测上限则挡住", () => {
    getEntry.mockReturnValue({ clobPrice: 0.32 });
    expect(mixedPendingAskAboveDetection(pmLeg({
      detectionOdds: 5,
      detectionMaxPrice: 0.2,
      detectionClobPrice: 0.2,
    }))).toBe("fo 卖一高于上限");
  });

  it("fo 在上限内放行", () => {
    getEntry.mockReturnValue({ clobPrice: 0.2, isLock: false });
    expect(mixedPendingAskAboveDetection(pmLeg({
      detectionOdds: 5,
      detectionMaxPrice: 0.2,
      detectionClobPrice: 0.2,
    }))).toBeNull();
  });

  it("fo 已锁盘即使卖一仍在上限内也挡住", () => {
    getEntry.mockReturnValue({ clobPrice: 0.2, isLock: true });
    expect(mixedPendingAskAboveDetection(pmLeg({
      detectionOdds: 5,
      detectionMaxPrice: 0.2,
      detectionClobPrice: 0.2,
    }))).toBe("盘口已锁");
  });

  it("fo 行存在但无有效卖一、未锁盘则放行", () => {
    getEntry.mockReturnValue({ isLock: false });
    expect(mixedPendingAskAboveDetection(pmLeg({
      detectionOdds: 5,
      detectionMaxPrice: 0.2,
      detectionClobPrice: 0.2,
    }))).toBeNull();
  });

  it("PredictFun fo 卖一高于上限同样挡住", () => {
    getEntry.mockReturnValue({ clobPrice: 0.4 });
    const pf = new BetOptionClass("PredictFun" as never, "m1", "b1", "token-pf", 10, "Home", 5);
    pf.data = { detectionOdds: 5, detectionClobPrice: 0.2 };
    expect(mixedPendingAskAboveDetection(pf)).toBe("fo 卖一高于上限");
  });

  it("即时馆不是 pending-confirm，不读 fo", () => {
    getEntry.mockReturnValue({ clobPrice: 0.9 });
    const ray = new BetOptionClass("RAY" as never, "m1", "b1", "i1", 10, "Away", 1.9);
    expect(mixedPendingAskAboveDetection(ray)).toBeNull();
    expect(getEntry).not.toHaveBeenCalled();
  });
});
