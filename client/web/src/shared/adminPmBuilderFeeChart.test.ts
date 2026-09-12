import { describe, expect, it } from "vitest";
import {
  aggregateBuilderFeesByDay,
  currentMonthKey,
  daysInMonth,
  localDayKey,
  maxSeriesValue,
  parseMonthKey,
  shiftMonthKey,
  sumDayFeeBuckets,
} from "./adminPmBuilderFeeChart";

function atLocal(y: number, m: number, d: number, h = 12): number {
  return new Date(y, m - 1, d, h, 0, 0, 0).getTime();
}

describe("month key helpers", () => {
  it("parses YYYY-MM and falls back on junk", () => {
    expect(parseMonthKey("2026-09")).toEqual({ y: 2026, m: 9 });
    const fb = new Date(2024, 0, 15);
    expect(parseMonthKey("nope", fb)).toEqual({ y: 2024, m: 1 });
  });

  it("shifts across year boundary", () => {
    expect(shiftMonthKey("2026-01", -1)).toBe("2025-12");
    expect(shiftMonthKey("2025-12", 1)).toBe("2026-01");
  });

  it("reports days in month including leap Feb", () => {
    expect(daysInMonth(2026, 9)).toBe(30);
    expect(daysInMonth(2024, 2)).toBe(29);
  });

  it("formats current month as YYYY-MM", () => {
    expect(currentMonthKey(new Date(2026, 8, 12))).toBe("2026-09");
  });
});

describe("aggregateBuilderFeesByDay", () => {
  it("fills every local day with zeros when empty", () => {
    const rows = aggregateBuilderFeesByDay([], "2026-09");
    expect(rows).toHaveLength(30);
    expect(rows[0]).toMatchObject({ day: 1, key: "2026-09-01", tradeCount: 0, builderFeeUsdc: 0 });
    expect(rows[29]).toMatchObject({ day: 30, key: "2026-09-30" });
  });

  it("sums builderFee / fee / volume and buy-sell split on the local day", () => {
    const rows = aggregateBuilderFeesByDay([
      {
        matchTime: atLocal(2026, 9, 2, 9),
        sizeUsdc: 10,
        feeUsdc: 0.4,
        builderFeeUsdc: 0.1,
        side: "BUY",
      },
      {
        matchTime: atLocal(2026, 9, 2, 21),
        sizeUsdc: 5,
        feeUsdc: 0.2,
        builderFeeUsdc: 0.05,
        side: "SELL",
      },
      {
        matchTime: atLocal(2026, 9, 5, 1),
        sizeUsdc: 8,
        feeUsdc: 0.3,
        builderFeeUsdc: 0,
        side: "BUY",
      },
    ], "2026-09");
    const d2 = rows.find(r => r.day === 2)!;
    const d5 = rows.find(r => r.day === 5)!;
    expect(d2.tradeCount).toBe(2);
    expect(d2.volumeUsdc).toBe(15);
    expect(d2.feeUsdc).toBeCloseTo(0.6);
    expect(d2.builderFeeUsdc).toBeCloseTo(0.15);
    expect(d2.buyBuilderFeeUsdc).toBeCloseTo(0.1);
    expect(d2.sellBuilderFeeUsdc).toBeCloseTo(0.05);
    expect(d5.tradeCount).toBe(1);
    expect(d5.volumeUsdc).toBe(8);
    expect(rows.find(r => r.day === 1)!.tradeCount).toBe(0);
  });

  it("drops trades outside the month and without matchTime", () => {
    const rows = aggregateBuilderFeesByDay([
      { matchTime: atLocal(2026, 8, 31), sizeUsdc: 99, feeUsdc: 1, builderFeeUsdc: 1, side: "BUY" },
      { matchTime: null, sizeUsdc: 99, feeUsdc: 1, builderFeeUsdc: 1, side: "BUY" },
      { matchTime: atLocal(2026, 9, 1, 0), sizeUsdc: 2, feeUsdc: 0.1, builderFeeUsdc: 0.01, side: "BUY" },
    ], "2026-09");
    expect(sumDayFeeBuckets(rows)).toMatchObject({
      tradeCount: 1,
      volumeUsdc: 2,
      feeUsdc: 0.1,
      builderFeeUsdc: 0.01,
    });
  });

  it("localDayKey uses local calendar, not UTC", () => {
    const ms = atLocal(2026, 9, 12, 0);
    expect(localDayKey(ms)).toBe("2026-09-12");
  });
});

describe("chart scale helpers", () => {
  it("maxSeriesValue reads the requested keys", () => {
    const rows = aggregateBuilderFeesByDay([
      { matchTime: atLocal(2026, 9, 1), sizeUsdc: 100, feeUsdc: 1, builderFeeUsdc: 0.2, side: "BUY" },
      { matchTime: atLocal(2026, 9, 2), sizeUsdc: 40, feeUsdc: 3, builderFeeUsdc: 0.5, side: "SELL" },
    ], "2026-09");
    expect(maxSeriesValue(rows, ["builderFeeUsdc"])).toBeCloseTo(0.5);
    expect(maxSeriesValue(rows, ["feeUsdc", "builderFeeUsdc"])).toBeCloseTo(3);
    expect(maxSeriesValue(rows, ["volumeUsdc"])).toBe(100);
  });
});
