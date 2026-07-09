import { describe, expect, it } from "vitest";
import {
  formatValueBetLabel,
  readValueBetMoney,
  valueBetSuggestedStake,
} from "@/extensions/valueBet/valueBetStake";

describe("valueBetSuggestedStake", () => {
  it("returns fixed stake only for positive EV (>= MIN_EDGE)", () => {
    expect(valueBetSuggestedStake(0.03, 100)).toBe(100);
    expect(valueBetSuggestedStake(0.08, 100)).toBe(100);
    expect(valueBetSuggestedStake(0.029, 100)).toBeNull();
  });

  it("hides stake when valueBetMoney is 0", () => {
    expect(valueBetSuggestedStake(0.05, 0)).toBeNull();
  });
});

describe("formatValueBetLabel", () => {
  it("appends ¥stake for positive EV", () => {
    expect(formatValueBetLabel(0.05, 100)).toBe("+5.0% ¥100");
  });

  it("keeps percent-only for near EV", () => {
    expect(formatValueBetLabel(0.02, 100)).toBe("+2.0%");
  });
});

describe("readValueBetMoney", () => {
  it("defaults to 100", () => {
    expect(readValueBetMoney(undefined)).toBe(100);
    expect(readValueBetMoney({ valueBetMoney: 80 })).toBe(80);
  });
});
