import { describe, expect, it } from "vitest";
import {
  compareOrderLinkDesc,
  groupOrdersByLink,
  isLinkedArbOrderGroup,
  linkIdGroupKey,
  orderLinkLegend,
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

  it("PM sold before market settle shows realized P&L in legend", () => {
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
        BetMoney: 0,
        Odds: 1.5,
        Money: 43,
        Type: "Polymarket",
        PmSide: "sell",
      },
    ]);
    expect(text).toBe("+43");
  });

  it("PM sold legs sum realized P&L in legend", () => {
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
        BetMoney: 0,
        Odds: 1.51,
        Money: 43,
        Type: "Polymarket",
        PmSide: "sell",
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
        BetMoney: 0,
        Odds: 1.4,
        Money: 14,
        Type: "Polymarket",
        PmSide: "sell",
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

  it("isLinkedArbOrderGroup detects positive multi-leg link", () => {
    expect(
      isLinkedArbOrderGroup([
        { Link: 123, OrderID: "a" },
        { Link: 123, OrderID: "b" },
      ]),
    ).toBe(true);
    expect(isLinkedArbOrderGroup([{ Link: -123, OrderID: "a" }])).toBe(false);
  });
});
