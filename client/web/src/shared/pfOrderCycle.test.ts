import { describe, expect, it } from "vitest";
import type { AdminOrderRow } from "@/types/admin";
import {
  buildPfCycles,
  flattenPfCyclesForAdminDisplay,
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

  it("final: sold = RDS sell proceeds as-is", () => {
    expect(resolvePfCycleFinalUsdt({
      buy: buy({ pfSellState: "closed" }),
      sold: true,
      sellProceedsUsdt: 12,
    })).toBe(12);
  });

  it("buildPfCycles surfaces Changmencodefee from buy/sell raw fields", () => {
    const cycles = buildPfCycles([
      buy({
        orderId: "0xbuy1",
        betMoney: 10,
        pfSellState: "closed",
        pfSellOrderId: "0xsell1",
        pfSellProceeds: 13.23,
        pfChangmenCodeFeeRateBps: 100,
        pfChangmenCodeFeeShares: 0.25,
      }),
      {
        ...buy({
          orderId: "0xsell1",
          pfSide: "sell",
          pfBuyOrderId: "0xbuy1",
          betMoney: 13.23,
          money: 0,
          pfChangmenCodeFeeRateBps: 200,
          pfChangmenCodeFeeUsdt: 0.27,
        }),
      },
    ]);
    expect(cycles[0].changmenBuyFeeRateBps).toBe(100);
    expect(cycles[0].changmenBuyFeeShares).toBe(0.25);
    expect(cycles[0].changmenSellFeeRateBps).toBe(200);
    expect(cycles[0].changmenSellFeeUsdt).toBe(0.27);
  });

  it("buildPfCycles reads RDS proceeds without client-side fee deduction", () => {
    const cycles = buildPfCycles([
      buy({
        orderId: "0xbuy1",
        betMoney: 10,
        pfSellState: "closed",
        pfSellOrderId: "0xsell1",
        pfSellProceeds: 13.5,
      }),
      {
        ...buy({
          orderId: "0xsell1",
          pfSide: "sell",
          pfBuyOrderId: "0xbuy1",
          betMoney: 13.5,
          money: 0,
          pfFeeType: "COLLATERAL",
          pfFeeUsdt: 0.25,
        }),
      },
    ]);
    expect(cycles[0].sellProceedsUsdt).toBe(13.5);
    expect(cycles[0].sellFeeUsdt).toBe(0.25);
    expect(cycles[0].finalUsdt).toBe(13.5);
    expect(cycles[0].profitUsdt).toBe(3.5);
  });

  it("final: win = stake + money", () => {
    expect(resolvePfCycleFinalUsdt({
      buy: buy({ status: "Win", betMoney: 13, money: 27.656 }),
      sold: false,
      sellProceedsUsdt: null,
    })).toBeCloseTo(40.656, 5);
  });

  it("final: lose = 0; reject/open = null", () => {
    expect(resolvePfCycleFinalUsdt({
      buy: buy({ status: "Lose" }),
      sold: false,
      sellProceedsUsdt: null,
    })).toBe(0);
    expect(resolvePfCycleFinalUsdt({
      buy: buy({ status: "Reject" }),
      sold: false,
      sellProceedsUsdt: null,
    })).toBeNull();
    expect(resolvePfCycleFinalUsdt({
      buy: buy({ status: "Pending" }),
      sold: false,
      sellProceedsUsdt: null,
    })).toBeNull();
  });

  it("profit = final - stake", () => {
    expect(resolvePfCycleProfitUsdt(15, 0)).toBe(-15);
    expect(resolvePfCycleProfitUsdt(10, 12)).toBe(2);
    expect(resolvePfCycleProfitUsdt(10, null)).toBeNull();
  });

  it("buildPfCycles reject has no fill/hold shares", () => {
    const cycles = buildPfCycles([
      buy({
        orderId: "0xrej",
        status: "Reject",
        betMoney: 29.41,
        pfShares: 42.19677,
        pfHoldShares: 42.19677,
        pfBookPrice: 0.69,
        pfNotionalUsdt: 29.41,
      }),
    ]);
    expect(cycles).toHaveLength(1);
    expect(cycles[0].buyShares).toBeNull();
    expect(cycles[0].netShares).toBeNull();
    expect(cycles[0].buyNotionalUsdt).toBe(29.41);
  });

  it("buildPfCycles ignores non-PredictFun arb siblings (e.g. PB)", () => {
    const cycles = buildPfCycles([
      buy({
        orderId: "0xpf",
        provider: "PredictFun",
        betMoney: 27.21,
        status: "Lose",
        money: -27.21,
      }),
      {
        ...buy({
          orderId: "753889052",
          provider: "PB",
          betMoney: 200,
          money: 194,
          status: "Win",
          match: "Nuclear TigeRES -vs- ECHO",
          bet: "地图1",
          item: "ECHO",
        }),
        pfSide: undefined,
      },
    ]);
    expect(cycles).toHaveLength(1);
    expect(cycles[0].buy.orderId).toBe("0xpf");
  });

  it("buildPfCycles without hold falls back to fill shares (no client fee math)", () => {
    const cycles = buildPfCycles([
      buy({
        orderId: "0xlegacy",
        pfShares: 46.428,
        pfFeeType: "SHARES",
        pfFeeAmountWei: "840000000000000000",
      }),
    ]);
    expect(cycles[0].buyShares).toBeCloseTo(46.428, 5);
    expect(cycles[0].buyFeeShares).toBeCloseTo(0.84, 5);
    // 无 pfHoldShares：不在前端做 fill − fee
    expect(cycles[0].netShares).toBeCloseTo(46.428, 5);
  });

  it("buildPfCycles prefers events when pfSellProceeds is 0 (sync miswrite)", () => {
    const cycles = buildPfCycles([
      buy({
        orderId: "0xbuy-ev",
        betMoney: 10,
        pfSellState: "closed",
        pfSellProceeds: 0,
        positionEvents: {
          sells: [{ id: "0xs-ev", proceeds: 7.5, shares: 10 }],
        },
      }),
    ]);
    expect(cycles).toHaveLength(1);
    expect(cycles[0].sellProceedsUsdt).toBe(7.5);
  });

  it("buildPfCycles joins sell onto buy and hides sell rows", () => {
    const cycles = buildPfCycles([
      buy({
        id: 1,
        orderId: "0xbuy1",
        betMoney: 15,
        pfShares: 46.875,
        pfHoldShares: 46.03125,
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
    expect(cycles[0].buyShares).toBeCloseTo(46.875, 5);
    expect(cycles[0].netShares).toBeCloseTo(46.03125, 5);
    expect(cycles[0].sellProceedsUsdt).toBe(10);
    expect(cycles[0].finalUsdt).toBe(10);
    expect(cycles[0].profitUsdt).toBe(-5);
    expect(cycles[1].finalUsdt).toBe(0);
    expect(cycles[1].profitUsdt).toBe(-13);
  });

  it("buildPfCycles exposes house edge = notional - fill", () => {
    const cycles = buildPfCycles([
      buy({
        betMoney: 14.12,
        pfNotionalUsdt: 14.12,
        pfFillCostUsdt: 13.68,
        pfShares: 44.125,
      }),
    ]);
    expect(cycles).toHaveLength(1);
    expect(cycles[0].buyNotionalUsdt).toBe(14.12);
    expect(cycles[0].buyFillCostUsdt).toBe(13.68);
    expect(cycles[0].houseEdgeUsdt).toBeCloseTo(0.44, 6);
  });

  it("flattenPfCyclesForAdminDisplay: buy + attached sell", () => {
    const cycles = buildPfCycles([
      buy({
        orderId: "0xbuy1",
        pfSellState: "closed",
        pfSellOrderId: "0xsell1",
        pfSellProceeds: 12,
      }),
      {
        ...buy({
          orderId: "0xsell1",
          pfSide: "sell",
          pfBuyOrderId: "0xbuy1",
          betMoney: 12,
        }),
      },
    ]);
    const rows = flattenPfCyclesForAdminDisplay(cycles);
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({ kind: "buy", attach: false, order: { orderId: "0xbuy1" } });
    expect(rows[1]).toMatchObject({ kind: "sell", attach: true, order: { orderId: "0xsell1" } });
    expect(rows[0].cycle).toBe(rows[1].cycle);
  });

  it("flattenPfCyclesForAdminDisplay: buy only when no sell", () => {
    const cycles = buildPfCycles([buy({ orderId: "0xopen" })]);
    const rows = flattenPfCyclesForAdminDisplay(cycles);
    expect(rows).toHaveLength(1);
    expect(rows[0].kind).toBe("buy");
    expect(rows[0].attach).toBe(false);
    expect(rows[0].order.orderId).toBe("0xopen");
  });
});
