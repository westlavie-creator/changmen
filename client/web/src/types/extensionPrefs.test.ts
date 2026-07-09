import { describe, expect, it } from "vitest";
import { createDefaultExtensionPrefs, normalizeExtensionPrefs } from "@/types/extensionPrefs";

const defaultStakeScale = {
  enabled: false,
  minImplied: 1.05,
  multiplier: 2,
};

describe("extensionPrefs", () => {
  it("defaults betRowUi to false and singleLeg9999Precheck to true", () => {
    expect(createDefaultExtensionPrefs()).toEqual({
      betRowUi: false,
      singleLeg9999Precheck: true,
      stakeScaleByProfit: defaultStakeScale,
    });
  });

  it("normalizes missing payload", () => {
    expect(normalizeExtensionPrefs(null)).toEqual({
      betRowUi: false,
      singleLeg9999Precheck: true,
      stakeScaleByProfit: defaultStakeScale,
    });
  });

  it("respects explicit true", () => {
    expect(normalizeExtensionPrefs({ betRowUi: true })).toEqual({
      betRowUi: true,
      singleLeg9999Precheck: true,
      stakeScaleByProfit: defaultStakeScale,
    });
  });

  it("can disable singleLeg9999Precheck", () => {
    expect(normalizeExtensionPrefs({ singleLeg9999Precheck: false })).toEqual({
      betRowUi: false,
      singleLeg9999Precheck: false,
      stakeScaleByProfit: defaultStakeScale,
    });
  });

  it("normalizes stakeScaleByProfit", () => {
    expect(normalizeExtensionPrefs({
      stakeScaleByProfit: { enabled: true, minImplied: 1.08, multiplier: 1.5 },
    })).toEqual({
      betRowUi: false,
      singleLeg9999Precheck: true,
      stakeScaleByProfit: { enabled: true, minImplied: 1.08, multiplier: 1.5 },
    });
  });

  it("falls back invalid stakeScaleByProfit numbers", () => {
    expect(normalizeExtensionPrefs({
      stakeScaleByProfit: { enabled: true, minImplied: 0.9, multiplier: -2 },
    }).stakeScaleByProfit).toEqual({
      enabled: true,
      minImplied: 1.05,
      multiplier: 2,
    });
  });
});
