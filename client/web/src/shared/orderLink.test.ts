import { describe, expect, it } from "vitest";
import {
  compareOrderLinkDesc,
  computeOrderGroupProfit,
  groupOrdersByLink,
  isLinkedArbOrderGroup,
  linkIdGroupKey,
  orderLinkLegend,
  pmBuyDisplayProfitCny,
  pmBuyDisplayStatus,
  sortOrdersByLinkDesc,
} from "./orderLink";

describe("orderLink A8 parity", () => {
  it("linkIdGroupKey uses Link as-is", () => {
    expect(linkIdGroupKey(1_700_000_000_123)).toBe(1_700_000_000_123);
    expect(linkIdGroupKey(-1_700_000_000_123)).toBe(-1_700_000_000_123);
    expect(linkIdGroupKey(undefined)).toBe(0);
  });

  it("sortOrdersByLinkDesc orders groups by Link descending", () => {
    const sorted = sortOrdersByLinkDesc([
      { Link: 100 },
      { Link: 300 },
      { Link: 200 },
    ]);
    expect(sorted.map(r => r.Link)).toEqual([300, 200, 100]);
  });

  it("compareOrderLinkDesc matches A8 bundle comparator", () => {
    expect(compareOrderLinkDesc({ Link: 300 }, { Link: 100 })).toBe(-1);
    expect(compareOrderLinkDesc({ Link: 100 }, { Link: 300 })).toBe(1);
    expect(compareOrderLinkDesc({ Link: 100 }, { Link: 100 })).toBe(1);
  });

  it("groups two legs with the same Link (groupBy insertion order)", () => {
    const link = 1_700_000_000_999;
    const grouped = groupOrdersByLink([
      { OrderID: "a", Link: link, CreateAt: 2000 },
      { OrderID: "b", Link: link, CreateAt: 1000 },
    ]);
    expect(grouped.size).toBe(1);
    const ids = grouped.get(link)?.map(r => r.OrderID) ?? [];
    expect(ids).toContain("a");
    expect(ids).toContain("b");
    expect(ids).toHaveLength(2);
  });

  it("PM sell with PmBuyOrderId joins buy link group when links differ", () => {
    const buyLink = 1_700_000_000_100;
    const sellLink = 1_700_000_000_200;
    const grouped = groupOrdersByLink([
      {
        OrderID: "0xbuy",
        Link: buyLink,
        Type: "Polymarket",
        PmSide: "buy",
        CreateAt: 1000,
        Money: 0,
      },
      {
        OrderID: "0xsell",
        Link: sellLink,
        Type: "Polymarket",
        PmSide: "sell",
        PmBuyOrderId: "0xbuy",
        CreateAt: 2000,
        Money: 10,
      },
    ]);
    expect(grouped.size).toBe(1);
    const rows = grouped.get(buyLink) ?? [];
    expect(rows.map(r => r.OrderID)).toEqual(["0xbuy", "0xsell"]);
  });

  it("arb Link keeps OB + PM buy + PM sell in one fieldset", () => {
    const arbLink = 1_700_000_000_999;
    const grouped = groupOrdersByLink([
      { OrderID: "ob-1", Link: arbLink, Type: "OB", CreateAt: 1000 },
      { OrderID: "0xbuy", Link: arbLink, Type: "Polymarket", PmSide: "buy" as const, CreateAt: 1001 },
      {
        OrderID: "0xsell",
        Link: 1_700_000_000_001,
        Type: "Polymarket",
        PmSide: "sell" as const,
        PmBuyOrderId: "0xbuy",
        CreateAt: 2000,
      },
    ]);
    expect(grouped.size).toBe(1);
    expect(grouped.get(arbLink)?.map(r => r.OrderID)).toEqual(["ob-1", "0xbuy", "0xsell"]);
    expect(
      isLinkedArbOrderGroup(grouped.get(arbLink) ?? []),
    ).toBe(true);
  });

  it("legend joins unsettled preview with dash", () => {
    const text = orderLinkLegend([
      { Status: "None", BetMoney: 100, Odds: 2.0, Money: 0, Type: "OB" },
      { Status: "None", BetMoney: 100, Odds: 2.2, Money: 0, Type: "RAY" },
    ]);
    expect(text).toContain(" - ");
  });

  it("PM unsettled shows 待结算 without bet×odds float", () => {
    const text = orderLinkLegend([
      { Status: "None", BetMoney: 100, Odds: 2.0, Money: 0, Type: "Polymarket" },
    ]);
    expect(text).toBe("待结算");
  });

  it("PM sold before market settle shows proceeds minus buy cost in legend", () => {
    const text = orderLinkLegend([
      {
        Status: "None",
        BetMoney: 100,
        Odds: 1.72,
        Money: 0,
        Type: "Polymarket",
        PmShares: 0,
        PmSellState: "closed",
        PmSide: "buy",
      },
      {
        Status: "None",
        BetMoney: 143,
        Odds: 1.5,
        Money: 43,
        Type: "Polymarket",
        PmSide: "sell",
        PmStakeUsdc: 100 / 7,
      },
    ]);
    expect(text).toBe("+43");
  });

  it("PM sold legs sum proceeds minus buy cost in legend", () => {
    const text = orderLinkLegend([
      {
        Status: "None",
        BetMoney: 50,
        Odds: 1.72,
        Money: 0,
        Type: "Polymarket",
        PmShares: 0,
        PmSellState: "closed",
        PmSide: "buy",
      },
      {
        Status: "None",
        BetMoney: 93,
        Odds: 1.51,
        Money: 43,
        Type: "Polymarket",
        PmSide: "sell",
        PmStakeUsdc: 50 / 7,
      },
      {
        Status: "None",
        BetMoney: 30,
        Odds: 1.51,
        Money: 0,
        Type: "Polymarket",
        PmShares: 0,
        PmSellState: "closed",
        PmSide: "buy",
      },
      {
        Status: "None",
        BetMoney: 44,
        Odds: 1.4,
        Money: 14,
        Type: "Polymarket",
        PmSide: "sell",
        PmStakeUsdc: 30 / 7,
      },
    ]);
    expect(text).toBe("+57");
  });

  it("9999 单边 link 在 legend 前缀展示 🏆", () => {
    const link = -1_700_000_000_123;
    const text = orderLinkLegend([
      { Link: link, Status: "None", BetMoney: 100, Odds: 2.0, Money: 0 },
    ]);
    expect(text.startsWith("🏆")).toBe(true);
  });

  it("PM group profit uses PmBuyOrderId cost not sum of all buys", () => {
    const profit = computeOrderGroupProfit([
      {
        OrderID: "0xbuy70",
        Type: "Polymarket",
        PmSide: "buy",
        BetMoney: 70,
        Money: 36,
        Status: "Win",
      },
      {
        OrderID: "0xbuy98",
        Type: "Polymarket",
        PmSide: "buy",
        BetMoney: 98,
        Money: 71,
        Status: "Win",
      },
      {
        OrderID: "0xsell70",
        Type: "Polymarket",
        PmSide: "sell",
        PmBuyOrderId: "0xbuy70",
        BetMoney: 85,
        PmStakeUsdc: 10,
        Status: "None",
      },
      {
        OrderID: "0xsell98",
        Type: "Polymarket",
        PmSide: "sell",
        PmBuyOrderId: "0xbuy98",
        BetMoney: 144,
        PmStakeUsdc: 14,
        Status: "None",
      },
    ]);
    expect(profit).toBe(15 + 46);
  });

  it("isLinkedArbOrderGroup detects cross-platform arb legs on same Link", () => {
    expect(
      isLinkedArbOrderGroup([
        { Link: 123, OrderID: "a", Type: "OB" },
        { Link: 123, OrderID: "b", Type: "Polymarket" },
      ]),
    ).toBe(true);
    expect(
      isLinkedArbOrderGroup([
        { Link: 123, OrderID: "a", Type: "Polymarket", PmSide: "buy" },
        { Link: 123, OrderID: "b", Type: "Polymarket", PmSide: "sell" },
      ]),
    ).toBe(false);
    expect(isLinkedArbOrderGroup([{ Link: -123, OrderID: "a" }])).toBe(false);
  });

  it("pmBuyDisplayProfitCny uses market Money when holding to settle", () => {
    const group = [{
      OrderID: "0xbuy",
      Type: "Polymarket",
      PmSide: "buy" as const,
      BetMoney: 70,
      Money: 36,
      Status: "Win" as const,
      PmShares: 15.15,
    }];
    expect(pmBuyDisplayProfitCny(group[0], group)).toBe(36);
    expect(pmBuyDisplayStatus(group[0], group)).toBe("Win");
  });

  it("pmBuyDisplayProfitCny uses sell profit when sold out, not stale Win Money", () => {
    const group = [
      {
        OrderID: "0xbuy70",
        Type: "Polymarket",
        PmSide: "buy" as const,
        BetMoney: 70,
        Money: 36,
        Status: "Win" as const,
        PmShares: 15.15,
      },
      {
        OrderID: "0xsell70",
        Type: "Polymarket",
        PmSide: "sell" as const,
        PmBuyOrderId: "0xbuy70",
        BetMoney: 85,
        Money: 15,
        PmShares: 15.15,
        PmStakeUsdc: 10,
        Status: "None" as const,
      },
    ];
    expect(pmBuyDisplayProfitCny(group[0], group)).toBe(15);
    expect(pmBuyDisplayStatus(group[0], group)).toBe("Win");
  });
});
