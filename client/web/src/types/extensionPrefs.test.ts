import { afterEach, describe, expect, it, vi } from "vitest";
import { createDefaultExtensionPrefs, normalizeExtensionPrefs } from "@/types/extensionPrefs";

const defaultStakeScale = {
  enabled: false,
  minImplied: 1.05,
  multiplier: 2,
  skipAccountRateOnScale: false,
};

const defaultPrefs = {
  betRowUi: false,
  singleLeg9999Precheck: true,
  singleLeg9999UseValueBetMoney: false,
  stakeScaleByProfit: defaultStakeScale,
  arbFailAutoSell: { enabled: false },
  arbEarlyLockSell: { enabled: false, mode: "floor" as const, minExtraProfitPct: 0 },
  uiTheme: "default" as const,
};

describe("extensionPrefs", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("defaults betRowUi to false and singleLeg9999Precheck to true", () => {
    expect(createDefaultExtensionPrefs()).toEqual(defaultPrefs);
  });

  it("normalizes missing payload", () => {
    expect(normalizeExtensionPrefs(null)).toEqual(defaultPrefs);
  });

  it("respects explicit true", () => {
    expect(normalizeExtensionPrefs({ betRowUi: true })).toEqual({
      ...defaultPrefs,
      betRowUi: true,
    });
  });

  it("can disable singleLeg9999Precheck", () => {
    expect(normalizeExtensionPrefs({ singleLeg9999Precheck: false })).toEqual({
      ...defaultPrefs,
      singleLeg9999Precheck: false,
    });
  });

  it("can enable singleLeg9999UseValueBetMoney", () => {
    expect(normalizeExtensionPrefs({ singleLeg9999UseValueBetMoney: true })).toEqual({
      ...defaultPrefs,
      singleLeg9999UseValueBetMoney: true,
    });
  });

  it("ignores legacy pmAutoExitSell key (feature removed)", () => {
    expect(normalizeExtensionPrefs({ pmAutoExitSell: true })).toEqual(defaultPrefs);
  });

  it("forces arbFailAutoSell off while temporarily locked", () => {
    expect(normalizeExtensionPrefs({
      arbFailAutoSell: { enabled: true },
    }).arbFailAutoSell).toEqual({ enabled: false });
  });

  it("defaults arbFailAutoSell off", () => {
    expect(normalizeExtensionPrefs({}).arbFailAutoSell).toEqual({ enabled: false });
  });

  it("can enable arbEarlyLockSell (dual prediction only; mode ignored by runtime)", () => {
    expect(normalizeExtensionPrefs({
      arbEarlyLockSell: { enabled: true, mode: "pmEdge", minExtraProfitPct: 5 },
    }).arbEarlyLockSell).toEqual({
      enabled: true,
      mode: "pmEdge",
      minExtraProfitPct: 5,
    });
    expect(normalizeExtensionPrefs({
      arbEarlyLockSell: { enabled: true, mode: "nope", minExtraProfitPct: "x" },
    }).arbEarlyLockSell).toEqual({
      enabled: true,
      mode: "floor",
      minExtraProfitPct: 0,
    });
  });

  it("clamps invalid minExtraProfitPct to default", () => {
    expect(normalizeExtensionPrefs({
      arbEarlyLockSell: { enabled: true, minExtraProfitPct: 999 },
    }).arbEarlyLockSell.minExtraProfitPct).toBe(0);
    expect(normalizeExtensionPrefs({
      arbEarlyLockSell: { enabled: true, minExtraProfitPct: -1 },
    }).arbEarlyLockSell.minExtraProfitPct).toBe(0);
  });

  it("defaults arbEarlyLockSell off", () => {
    expect(normalizeExtensionPrefs({}).arbEarlyLockSell).toEqual({
      enabled: false,
      mode: "floor",
      minExtraProfitPct: 0,
    });
  });

  it("ignores legacy venueHkEgress / pmHkEgress keys", () => {
    expect(normalizeExtensionPrefs({ venueHkEgress: true, pmHkEgress: true })).toEqual(defaultPrefs);
  });

  it("normalizes stakeScaleByProfit", () => {
    expect(normalizeExtensionPrefs({
      stakeScaleByProfit: {
        enabled: true,
        minImplied: 1.08,
        multiplier: 1.5,
        skipAccountRateOnScale: true,
      },
    })).toEqual({
      ...defaultPrefs,
      stakeScaleByProfit: {
        enabled: true,
        minImplied: 1.08,
        multiplier: 1.5,
        skipAccountRateOnScale: true,
      },
    });
  });

  it("falls back invalid stakeScaleByProfit numbers", () => {
    expect(normalizeExtensionPrefs({
      stakeScaleByProfit: { enabled: true, minImplied: 0.9, multiplier: -2 },
    }).stakeScaleByProfit).toEqual({
      enabled: true,
      minImplied: 1.05,
      multiplier: 2,
      skipAccountRateOnScale: false,
    });
  });

  it("accepts uiTheme variants and falls back unknown", () => {
    expect(normalizeExtensionPrefs({ uiTheme: "brutal" }).uiTheme).toBe("brutal");
    expect(normalizeExtensionPrefs({ uiTheme: "paper" }).uiTheme).toBe("paper");
    expect(normalizeExtensionPrefs({ uiTheme: "terminal" }).uiTheme).toBe("terminal");
    expect(normalizeExtensionPrefs({ uiTheme: "neon" }).uiTheme).toBe("default");
    expect(normalizeExtensionPrefs({}).uiTheme).toBe("default");
  });
});
