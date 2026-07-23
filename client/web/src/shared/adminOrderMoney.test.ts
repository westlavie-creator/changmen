import { describe, expect, it } from "vitest";
import { adminOrderBetMoneyCny, adminOrderMoneyCny, sumAdminOrdersMoneyCny } from "./adminOrderMoney";

describe("adminOrderMoneyCny", () => {
  it("passes through CNY venue money", () => {
    expect(adminOrderMoneyCny({ provider: "OB", money: 100 })).toBe(100);
  });

  it("scales PredictFun buy money USDT → CNY", () => {
    expect(adminOrderMoneyCny({ provider: "PredictFun", money: -29.41, pfSide: "buy" }))
      .toBeCloseTo(-29.41 * 6.8, 6);
  });

  it("zeros PredictFun sell money", () => {
    expect(adminOrderMoneyCny({ provider: "PredictFun", money: 3, pfSide: "sell" })).toBe(0);
  });

  it("scales PredictFun betMoney", () => {
    expect(adminOrderBetMoneyCny({ provider: "PredictFun", betMoney: 27.21 }))
      .toBeCloseTo(27.21 * 6.8, 6);
  });

  it("sums mixed venues with PF FX", () => {
    const sum = sumAdminOrdersMoneyCny([
      { provider: "OB", money: 100 },
      { provider: "PredictFun", money: -10, pfSide: "buy" },
      { provider: "PredictFun", money: 0, pfSide: "sell" },
    ]);
    expect(sum).toBeCloseTo(100 - 10 * 6.8, 6);
  });
});
