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
