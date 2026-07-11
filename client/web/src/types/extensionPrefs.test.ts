import { describe, expect, it } from "vitest";
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
  pmAutoExitSell: true,
  venueHkEgress: false,
};

describe("extensionPrefs", () => {
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

  it("defaults pmAutoExitSell to true and can disable", () => {
    expect(normalizeExtensionPrefs({}).pmAutoExitSell).toBe(true);
    expect(normalizeExtensionPrefs({ pmAutoExitSell: false }).pmAutoExitSell).toBe(false);
  });

  it("defaults venueHkEgress to false and can enable", () => {
    expect(normalizeExtensionPrefs({}).venueHkEgress).toBe(false);
    expect(normalizeExtensionPrefs({ venueHkEgress: true }).venueHkEgress).toBe(true);
  });

  it("migrates legacy pmHkEgress to venueHkEgress", () => {
    expect(normalizeExtensionPrefs({ pmHkEgress: true }).venueHkEgress).toBe(true);
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
});
