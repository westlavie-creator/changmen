import { LoseOrder } from "@/models/loseOrder";
import { describe, expect, it } from "vitest";
import {
  compareOrderLinkDesc,
  computeOrderGroupProfit,
  groupOrdersByLink,
  isLinkedArbOrderGroup,
  linkIdGroupKey,
  loseOrderToPendingRow,
  makeupPendingProfitLabel,
  mergePendingMakeupIntoOrderGroups,
  orderLinkLegend,
  orderListDisplayRows,
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

  it("groups two legs with the same Link", () => {
    const link = 1_700_000_000_999;
    const grouped = groupOrdersByLink([
      { OrderID: "a", Link: link, CreateAt: 2000 },
      { OrderID: "b", Link: link, CreateAt: 1000 },
    ]);
    expect(grouped.size).toBe(1);
    expect(grouped.get(link)?.map(r => r.OrderID)).toEqual(["a", "b"]);
  });

  it("legend joins unsettled preview with dash", () => {
    const text = orderLinkLegend([
      { Status: "None", BetMoney: 100, Odds: 2.0, Money: 0, Type: "OB" },
      { Status: "None", BetMoney: 100, Odds: 2.2, Money: 0, Type: "RAY" },
    ]);
    expect(text).toContain(" - ");
  });

  it("legend joins unsettled OB + PM preview with dash", () => {
    const text = orderLinkLegend([
      { Status: "None", BetMoney: 100, Odds: 3.0, Money: 0, Type: "OB" },
      { Status: "None", BetMoney: 100, Odds: 1.8, Money: 0, Type: "Polymarket", PmSide: "buy" },
    ]);
    expect(text).toBe("100 - -20");
  });

  it("PM unsettled uses bet×odds−stake preview like A8", () => {
    const text = orderLinkLegend([
      { Status: "None", BetMoney: 100, Odds: 2.0, Money: 0, Type: "Polymarket" },
    ]);
    expect(text).toBe("100");
  });

  it("9999 单边 link 在 legend 前缀展示 🏆", () => {
    const link = -1_700_000_000_123;
    const text = orderLinkLegend([
      { Link: link, Status: "None", BetMoney: 100, Odds: 2.0, Money: 0 },
    ]);
    expect(text.startsWith("🏆")).toBe(true);
  });

  it("computeOrderGroupProfit sums buy Money and skips PM sells", () => {
    const profit = computeOrderGroupProfit([
      { Type: "OB", Money: 10 },
      { Type: "Polymarket", PmSide: "buy", Money: 36, Status: "Win" },
      { Type: "Polymarket", PmSide: "sell", Money: 15, BetMoney: 85 },
    ]);
    expect(profit).toBe(46);
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

  it("orderListDisplayRows hides PM sell rows but keeps buys and trad legs", () => {
    const rows = [
      { OrderID: "ob", Type: "OB", PmSide: undefined },
      { OrderID: "0xbuy", Type: "Polymarket", PmSide: "buy" as const },
      { OrderID: "0xsell", Type: "Polymarket", PmSide: "sell" as const, PmBuyOrderId: "0xbuy" },
    ];
    expect(orderListDisplayRows(rows).map(r => r.OrderID)).toEqual(["ob", "0xbuy"]);
  });

  it("mergePendingMakeupIntoOrderGroups folds lose queue into arb link", () => {
    const link = 1_700_000_000_999;
    const groups = groupOrdersByLink([
      { OrderID: "pm-1", Link: link, Type: "Polymarket", Status: "None", BetMoney: 100, Odds: 2.6 },
    ]);
    const loseOrders = new Map([
      [
        42,
        new LoseOrder({
          betId: 42,
          linkId: link,
          target: "Away",
          betMoney: 90,
          betOdds: 2.956,
          match: "G2 vs T1",
          bet: "[地图4] 获胜",
          accountId: 1,
          matchId: 1,
        }),
      ],
    ]);
    const merged = mergePendingMakeupIntoOrderGroups(groups, loseOrders, 1.01);
    expect(merged.get(link)?.map(r => r.OrderID)).toEqual(["pm-1", "makeup-42"]);
    expect(orderLinkLegend(merged.get(link)!)).toContain("补单中");
  });

  it("loseOrderToPendingRow reflects runtime placing phase", () => {
    const row = loseOrderToPendingRow(
      new LoseOrder({
        betId: 42,
        linkId: 1,
        target: "Away",
        betMoney: 90,
        betOdds: 2.9,
        match: "G2 vs T1",
        bet: "map",
        accountId: 1,
        matchId: 1,
        runtimePhase: "placing",
      }),
      1.01,
    );
    expect(row.Status).toBe("MakeupPlacing");
    expect(makeupPendingProfitLabel(row)).toBe("下单中");
  });

  it("mergePendingMakeupIntoOrderGroups folds cancelled makeup into arb link", () => {
    const link = 1_700_000_000_999;
    const groups = groupOrdersByLink([
      { OrderID: "pm-1", Link: link, Type: "Polymarket", Status: "None", BetMoney: 100, Odds: 2.6 },
    ]);
    const cancelled = new Map([
      [
        42,
        {
          betId: 42,
          linkId: link,
          target: "Away" as const,
          match: "G2 vs T1",
          bet: "[地图4] 获胜",
          createAt: 1,
          cancelledAt: 2,
        },
      ],
    ]);
    const merged = mergePendingMakeupIntoOrderGroups(groups, new Map(), 1.01, cancelled);
    expect(merged.get(link)?.map(r => r.OrderID)).toEqual(["pm-1", "makeup-cancelled-42"]);
    expect(merged.get(link)?.[1]?.Player?.UserName).toBe("补单已手动取消");
  });
});
