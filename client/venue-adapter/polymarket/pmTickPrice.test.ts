import { describe, expect, it } from "vitest";
import {
  alignPolymarketPriceToTick,
  isPolymarketPriceOnTick,
  listPolymarketTickPricesInRange,
  normalizePolymarketTickSize,
  pickPolymarketAutoExitSellPrice,
} from "./pmTickPrice";

describe("normalizePolymarketTickSize", () => {
  it("accepts official ticks including 0.0025", () => {
    expect(normalizePolymarketTickSize("0.01")).toBe("0.01");
    expect(normalizePolymarketTickSize(0.001)).toBe("0.001");
    expect(normalizePolymarketTickSize("0.0025")).toBe("0.0025");
  });

  it("rejects unknown ticks", () => {
    expect(() => normalizePolymarketTickSize("0.05")).toThrow(/tick_size/);
  });
});

describe("isPolymarketPriceOnTick / alignPolymarketPriceToTick", () => {
  it("validates 0.01 tick", () => {
    expect(isPolymarketPriceOnTick(0.99, "0.01")).toBe(true);
    expect(isPolymarketPriceOnTick(0.995, "0.01")).toBe(false);
    expect(alignPolymarketPriceToTick(0.995, "0.01", "floor")).toBe(0.99);
  });

  it("validates 0.001 tick", () => {
    expect(isPolymarketPriceOnTick(0.995, "0.001")).toBe(true);
    expect(isPolymarketPriceOnTick(0.991, "0.001")).toBe(true);
  });

  it("validates 0.0025 tick", () => {
    expect(isPolymarketPriceOnTick(0.99, "0.0025")).toBe(true);
    expect(isPolymarketPriceOnTick(0.9925, "0.0025")).toBe(true);
    expect(isPolymarketPriceOnTick(0.995, "0.0025")).toBe(true);
    expect(isPolymarketPriceOnTick(0.991, "0.0025")).toBe(false);
  });
});

describe("listPolymarketTickPricesInRange", () => {
  it("tick 0.01 → only 0.99 in [0.99, 0.995]", () => {
    expect(listPolymarketTickPricesInRange("0.01")).toEqual([0.99]);
  });

  it("tick 0.001 → 0.990..0.995", () => {
    expect(listPolymarketTickPricesInRange("0.001")).toEqual([
      0.99, 0.991, 0.992, 0.993, 0.994, 0.995,
    ]);
  });

  it("tick 0.0025 → 0.99, 0.9925, 0.995", () => {
    expect(listPolymarketTickPricesInRange("0.0025")).toEqual([0.99, 0.9925, 0.995]);
  });

  it("tick 0.1 → empty in [0.99, 0.995]", () => {
    expect(listPolymarketTickPricesInRange("0.1")).toEqual([]);
  });
});

describe("pickPolymarketAutoExitSellPrice", () => {
  it("picks among tick-aligned candidates", () => {
    const prices = new Set<number>();
    for (let i = 0; i < 60; i++)
      prices.add(pickPolymarketAutoExitSellPrice("0.001", { random: () => i / 60 }));
    expect([...prices].sort((a, b) => a - b)).toEqual([
      0.99, 0.991, 0.992, 0.993, 0.994, 0.995,
    ]);
  });

  it("falls back to 0.99 when tick=0.01", () => {
    expect(pickPolymarketAutoExitSellPrice("0.01", { random: () => 0.9 })).toBe(0.99);
  });

  it("falls back to floor(max) when range has no tick (0.1)", () => {
    // 0.9 is the largest ≤0.995 on 0.1 tick
    expect(pickPolymarketAutoExitSellPrice("0.1")).toBe(0.9);
  });
});
