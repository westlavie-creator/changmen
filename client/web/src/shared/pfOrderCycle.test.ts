import { describe, expect, it } from "vitest";
import type { AdminOrderRow } from "@/types/admin";
import {
  buildPfCycles,
  pfNetShares,
  resolvePfCycleFinalUsdt,
  resolvePfCycleProfitUsdt,
} from "./pfOrderCycle";

function buy(partial: Partial<AdminOrderRow>): AdminOrderRow {
  return {
    id: 1,
    userId: "u1",
    playerId: 1,
    orderId: "0xbuy",
    linkId: 1,
    provider: "PredictFun",
    match: "A vs B",
    bet: "全场胜负",
    item: "A",
    odds: 2,
    betMoney: 10,
    money: 0,
    status: "None",
    createAt: 1,
    pfSide: "buy",
    pfShares: 20,
    ...partial,
  };
}

describe("pfOrderCycle", () => {
  it("net shares = buy shares - fee shares", () => {
    expect(pfNetShares(46.428, 0.84)).toBeCloseTo(45.588, 5);
    expect(pfNetShares(46.428, null)).toBe(46.428);
    expect(pfNetShares(null, 0.84)).toBeNull();
  });

  it("final: sold = proceeds - sell fee", () => {
    expect(resolvePfCycleFinalUsdt({
      buy: buy({ pfSellState: "closed" }),
      sold: true,
      sellProceedsUsdt: 12,
      sellFeeUsdt: 0.3,
    })).toBeCloseTo(11.7, 5);
  });

  it("final: win = stake + money", () => {
    expect(resolvePfCycleFinalUsdt({
      buy: buy({ status: "Win", betMoney: 13, money: 27.656 }),
      sold: false,
      sellProceedsUsdt: null,
      sellFeeUsdt: null,
    })).toBeCloseTo(40.656, 5);
  });

  it("final: lose = 0; reject/open = null", () => {
    expect(resolvePfCycleFinalUsdt({
      buy: buy({ status: "Lose" }),
      sold: false,
      sellProceedsUsdt: null,
      sellFeeUsdt: null,
    })).toBe(0);
    expect(resolvePfCycleFinalUsdt({
      buy: buy({ status: "Reject" }),
      sold: false,
      sellProceedsUsdt: null,
      sellFeeUsdt: null,
    })).toBeNull();
    expect(resolvePfCycleFinalUsdt({
      buy: buy({ status: "Pending" }),
      sold: false,
      sellProceedsUsdt: null,
      sellFeeUsdt: null,
    })).toBeNull();
  });

  it("profit = final - stake", () => {
    expect(resolvePfCycleProfitUsdt(15, 0)).toBe(-15);
    expect(resolvePfCycleProfitUsdt(10, 12)).toBe(2);
    expect(resolvePfCycleProfitUsdt(10, null)).toBeNull();
  });

  it("buildPfCycles joins sell onto buy and hides sell rows", () => {
    const cycles = buildPfCycles([
      buy({
        id: 1,
        orderId: "0xbuy1",
        betMoney: 15,
        pfShares: 46.875,
        pfFeeType: "SHARES",
        pfFeeAmountWei: "843750000000000000",
        pfSellState: "closed",
        pfSellOrderId: "0xsell1",
        pfSellProceeds: 10,
        status: "None",
      }),
      {
        ...buy({
          id: 2,
          orderId: "0xsell1",
          pfSide: "sell",
          pfBuyOrderId: "0xbuy1",
          betMoney: 10,
          money: 0,
          pfShares: 46.875,
          status: "None",
        }),
      },
      buy({
        id: 3,
        orderId: "0xbuy2",
        betMoney: 13,
        pfShares: 46.428,
        status: "Lose",
        money: -13,
      }),
    ]);
    expect(cycles).toHaveLength(2);
    expect(cycles[0].sell?.orderId).toBe("0xsell1");
    expect(cycles[0].buyFeeShares).toBeCloseTo(0.84375, 5);
    expect(cycles[0].netShares).toBeCloseTo(46.875 - 0.84375, 5);
    expect(cycles[0].sellProceedsUsdt).toBe(10);
    expect(cycles[0].finalUsdt).toBe(10);
    expect(cycles[0].profitUsdt).toBe(-5);
    expect(cycles[1].finalUsdt).toBe(0);
    expect(cycles[1].profitUsdt).toBe(-13);
  });
});
