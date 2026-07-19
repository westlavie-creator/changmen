import { LoseOrder } from "@/models/loseOrder";
import { describe, expect, it } from "vitest";
import {
  canRebindOrderLinkTo,
  canRebindOrderOnto,
  isSameOrderMatchMap,
  compareOrderLinkDesc,
  computeOrderGroupProfit,
  dropOrphanPolymarketSellGroups,
  filterOrdersBelongingToDate,
  groupOrdersByLink,
  isLinkedArbOrderGroup,
  isRebindableOrderRow,
  linkIdGroupKey,
  loseOrderToPendingRow,
  makeupPendingProfitLabel,
  mergePendingMakeupIntoOrderGroups,
  orderLinkLegend,
  orderListDisplayRows,
  orderProfitDateTs,
  sortOrdersByLinkDesc,
  toOrderDateKeyLocal,
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

  it("sorts valueBet link by decoded timestamp alongside arb/9999", () => {
    const ts = 1_780_000_000_500;
    const vb = -(7_000_000_000_000_000 + ts);
    const sorted = sortOrdersByLinkDesc([
      { Link: ts - 100 },
      { Link: vb },
      { Link: -(ts - 50) },
    ]);
    expect(sorted.map(r => r.Link)).toEqual([vb, -(ts - 50), ts - 100]);
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

  it("legend joins unsettled preview with slash", () => {
    const text = orderLinkLegend([
      { Status: "None", BetMoney: 100, Odds: 2.0, Money: 0, Type: "OB", Item: "Home", OrderID: "a" },
      { Status: "None", BetMoney: 100, Odds: 2.2, Money: 0, Type: "RAY", Item: "Away", OrderID: "b" },
    ]);
    expect(text).toContain(" / ");
  });

  it("legend joins unsettled OB + PM preview without double-dash", () => {
    const text = orderLinkLegend([
      { Status: "None", BetMoney: 100, Odds: 3.0, Money: 0, Type: "OB", Item: "Alpha", OrderID: "a" },
      {
        Status: "None",
        BetMoney: 100,
        Odds: 1.8,
        Money: 0,
        Type: "Polymarket",
        PmSide: "buy",
        Item: "Beta",
        OrderID: "b",
        PmTokenId: "tok-b",
      },
    ]);
    // stake=200; OB 按订单: 100*3-200=100; PM token: 100*1.8-200=-20
    expect(text).toBe("-20 / 100");
  });

  it("legend does not merge venue order into PM by team/Item name", () => {
    const text = orderLinkLegend([
      {
        OrderID: "pm-geng",
        Status: "None",
        BetMoney: 50,
        Odds: 1.408,
        Type: "Polymarket",
        PmSide: "buy",
        Item: "Gen.G Esports",
        PmTokenId: "tok-geng",
      },
      {
        OrderID: "od-geng",
        Status: "None",
        BetMoney: 182,
        Odds: 1.3,
        Type: "OD",
        Item: "Gen.G Esports",
      },
      {
        OrderID: "pm-ns",
        Status: "None",
        BetMoney: 119,
        Odds: 2.857,
        Type: "Polymarket",
        PmSide: "buy",
        Item: "Nongshim RedForce",
        PmTokenId: "tok-ns",
      },
    ]);
    // stake=351; PM geng / PM ns / OD 各算：约 -281 / -11 / -114
    expect(text).toBe("-281 / -11 / -114");
  });

  it("legend keeps venue orders per-order; only PM same-token merges", () => {
    const text = orderLinkLegend([
      {
        OrderID: "pm-trace",
        Status: "None",
        BetMoney: 50,
        Odds: 1.587,
        Type: "Polymarket",
        PmSide: "buy",
        Item: "Trace Esports",
        PmTokenId: "token-trace",
      },
      {
        OrderID: "pm-nova-a",
        Status: "None",
        BetMoney: 50,
        Odds: 1.388,
        Type: "Polymarket",
        PmSide: "buy",
        Item: "Nova Esports",
        PmTokenId: "token-nova",
      },
      {
        OrderID: "pm-nova-b",
        Status: "None",
        BetMoney: 50,
        Odds: 1.298,
        Type: "Polymarket",
        PmSide: "buy",
        Item: "Nova Esports",
        PmTokenId: "token-nova",
      },
      {
        OrderID: "pm-nova-c",
        Status: "None",
        BetMoney: 260,
        Odds: 1.428,
        Type: "Polymarket",
        PmSide: "buy",
        Item: "Nova Esports",
        PmTokenId: "token-nova",
      },
      {
        OrderID: "ray-te",
        Status: "None",
        BetMoney: 164,
        Odds: 2.35,
        Type: "RAY",
        Item: "TE",
      },
      {
        OrderID: "ray-nv-reject",
        Status: "Reject",
        BetMoney: 164,
        Odds: 2.35,
        Type: "RAY",
        Item: "NV",
      },
    ]);
    // stake=574; Trace / Nova(merged) / RAY TE ≈ -495 / -68 / -189
    expect(text).toBe("-495 / -68 / -189");
  });

  it("legend merges PM same-token buys even when Item text differs slightly", () => {
    const text = orderLinkLegend([
      {
        OrderID: "a",
        Status: "None",
        BetMoney: 100,
        Odds: 2,
        Type: "Polymarket",
        PmSide: "buy",
        Item: "Team A",
        PmTokenId: "tok-a",
      },
      {
        OrderID: "b",
        Status: "None",
        BetMoney: 50,
        Odds: 2,
        Type: "Polymarket",
        PmSide: "buy",
        Item: "Team A (extra)",
        PmTokenId: "tok-a",
      },
      {
        OrderID: "c",
        Status: "None",
        BetMoney: 100,
        Odds: 2.2,
        Type: "Polymarket",
        PmSide: "buy",
        Item: "Team B",
        PmTokenId: "tok-b",
      },
    ]);
    // stake=250; A: 100*2+50*2-250=50; B: 100*2.2-250=-30
    expect(text).toBe("50 / -30");
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

  it("正 EV link 在 legend 前缀展示 💎", () => {
    const link = -(7_000_000_000_000_000 + 1_700_000_000_123);
    const text = orderLinkLegend([
      { Link: link, Status: "None", BetMoney: 100, Odds: 2.0, Money: 0 },
    ]);
    expect(text.startsWith("💎")).toBe(true);
  });

  it("computeOrderGroupProfit uses buy Money when present; else legacy sell Money", () => {
    const profitLegacy = computeOrderGroupProfit([
      { Type: "OB", Money: 10 },
      { OrderID: "buy", Type: "Polymarket", PmSide: "buy", Money: 0, Status: "None", PmSellState: "closed" },
      { OrderID: "sell", Type: "Polymarket", PmSide: "sell", Money: 15, BetMoney: 85, PmBuyOrderId: "buy" },
    ]);
    expect(profitLegacy).toBe(25);

    const profitNew = computeOrderGroupProfit([
      { Type: "OB", Money: 10 },
      { OrderID: "buy", Type: "Polymarket", PmSide: "buy", Money: 15, Status: "None", PmSellState: "closed" },
      { OrderID: "sell", Type: "Polymarket", PmSide: "sell", Money: 15, BetMoney: 85, PmBuyOrderId: "buy" },
    ]);
    // 买单已有盈亏时不计卖单，防双计
    expect(profitNew).toBe(25);
  });

  it("computeOrderGroupProfit does not double-count when both have Money", () => {
    const profit = computeOrderGroupProfit([
      { OrderID: "buy", Type: "Polymarket", PmSide: "buy", Money: 184, Status: "None", PmSellState: "settled" },
      { OrderID: "sell", Type: "Polymarket", PmSide: "sell", Money: 184, BetMoney: 384, PmBuyOrderId: "buy" },
    ]);
    expect(profit).toBe(184);
  });

  it("orderLinkLegend uses sell P&L when buy Money still 0 (legacy)", () => {
    const text = orderLinkLegend([
      {
        OrderID: "0xsell",
        Link: 1784400520115,
        Type: "Polymarket",
        PmSide: "sell",
        Status: "None",
        BetMoney: 115,
        Money: 3,
        Odds: 2.857,
        PmBuyOrderId: "0xbuy",
      },
      {
        OrderID: "ray",
        Link: 1784400520115,
        Type: "RAY",
        Status: "Reject",
        BetMoney: 200,
        Money: 0,
        Odds: 1.64,
      },
      {
        OrderID: "0xbuy",
        Link: 1784400520115,
        Type: "Polymarket",
        PmSide: "buy",
        Status: "None",
        BetMoney: 112,
        Money: 0,
        Odds: 2.941,
        PmShares: 48.2353,
        PmAttributedSellShares: 48.23,
        PmSellState: "partial",
        PmStakeUsdc: 0,
      },
    ]);
    expect(text).toBe("+3");
  });

  it("dropOrphanPolymarketSellGroups hides sell-only link groups", () => {
    const grouped = groupOrdersByLink([
      { OrderID: "s1", Link: 100, Type: "Polymarket", PmSide: "sell" as const },
      { OrderID: "b1", Link: 200, Type: "Polymarket", PmSide: "buy" as const },
      { OrderID: "s2", Link: 200, Type: "Polymarket", PmSide: "sell" as const, PmBuyOrderId: "b1" },
      { OrderID: "ob", Link: 300, Type: "OB" },
    ]);
    const filtered = dropOrphanPolymarketSellGroups(grouped);
    expect([...filtered.keys()].sort()).toEqual([200, 300]);
    expect(filtered.get(100)).toBeUndefined();
    expect(filtered.get(200)?.map(r => r.OrderID)).toEqual(["b1", "s2"]);
  });

  it("PM sell belongs to buy day for display and day profit", () => {
    const buyAt = Date.parse("2026-07-18T15:36:00+08:00");
    const sellAt = Date.parse("2026-07-19T00:24:00+08:00");
    const buyDay = toOrderDateKeyLocal(buyAt);
    const sellDay = toOrderDateKeyLocal(sellAt);
    const rows = [
      {
        OrderID: "0xbuy",
        Link: 99,
        Type: "Polymarket",
        PmSide: "buy" as const,
        CreateAt: buyAt,
        Money: 0,
        PmSellState: "closed" as const,
      },
      {
        OrderID: "0xsell",
        Link: 99,
        Type: "Polymarket",
        PmSide: "sell" as const,
        CreateAt: sellAt,
        Money: 12,
        PmBuyOrderId: "0xbuy",
      },
    ];
    expect(orderProfitDateTs(rows[1]!, rows)).toBe(buyAt);
    expect(filterOrdersBelongingToDate(rows, buyDay).map(r => r.OrderID).sort())
      .toEqual(["0xbuy", "0xsell"]);
    expect(filterOrdersBelongingToDate(rows, sellDay)).toEqual([]);
  });

  it("filterOrdersBelongingToDate keeps cross-day arb siblings when no PM sell", () => {
    const yday = Date.parse("2026-07-18T12:00:00+08:00");
    const today = Date.parse("2026-07-19T12:00:00+08:00");
    const todayKey = toOrderDateKeyLocal(today);
    const rows = [
      { OrderID: "ob", Link: 7, Type: "OB", CreateAt: yday, Money: 5 },
      { OrderID: "pm", Link: 7, Type: "Polymarket", PmSide: "buy" as const, CreateAt: today, Money: 0 },
    ];
    expect(filterOrdersBelongingToDate(rows, todayKey).map(r => r.OrderID).sort())
      .toEqual(["ob", "pm"]);
  });

  it("computeOrderGroupProfit includes buy Money on partial close (new model)", () => {
    const profit = computeOrderGroupProfit([
      { OrderID: "buy", Type: "Polymarket", PmSide: "buy", Money: 8, Status: "None", PmSellState: "partial" },
      { OrderID: "sell", Type: "Polymarket", PmSide: "sell", Money: 0, BetMoney: 40, PmBuyOrderId: "buy" },
    ]);
    expect(profit).toBe(8);
  });

  it("computeOrderGroupProfit includes legacy sell Money on partial close", () => {
    const profit = computeOrderGroupProfit([
      { OrderID: "buy", Type: "Polymarket", PmSide: "buy", Money: 0, Status: "None", PmSellState: "partial" },
      { OrderID: "sell", Type: "Polymarket", PmSide: "sell", Money: 8, BetMoney: 40, PmBuyOrderId: "buy" },
    ]);
    expect(profit).toBe(8);
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

  it("orderListDisplayRows keeps PM sell rows with buys and trad legs", () => {
    const rows = [
      { OrderID: "ob", Type: "OB", PmSide: undefined },
      { OrderID: "0xbuy", Type: "Polymarket", PmSide: "buy" as const },
      { OrderID: "0xsell", Type: "Polymarket", PmSide: "sell" as const, PmBuyOrderId: "0xbuy" },
    ];
    expect(orderListDisplayRows(rows).map(r => r.OrderID)).toEqual(["ob", "0xbuy", "0xsell"]);
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

  it("mergePendingMakeupIntoOrderGroups does not fold cancelled makeup into arb link", () => {
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
    expect(merged.get(link)?.map(r => r.OrderID)).toEqual(["pm-1"]);
  });

  it("canRebindOrderLinkTo only allows newer link onto older link", () => {
    const older = 1_700_000_000_100;
    const newer = 1_700_000_000_200;
    expect(canRebindOrderLinkTo(newer, older)).toBe(true);
    expect(canRebindOrderLinkTo(older, newer)).toBe(false);
    expect(canRebindOrderLinkTo(newer, newer)).toBe(false);
  });

  it("isSameOrderMatchMap requires same match and map slot", () => {
    expect(isSameOrderMatchMap(
      { Match: "A vs B", Bet: "[地图2] 获胜" },
      { Match: "B vs A", Bet: "[地图2] 让分" },
    )).toBe(true);
    expect(isSameOrderMatchMap(
      { Match: "A vs B", Bet: "[地图2] 获胜" },
      { Match: "A vs B", Bet: "[地图1] 获胜" },
    )).toBe(false);
    expect(isSameOrderMatchMap(
      { Match: "A vs B", Bet: "[地图2] 获胜" },
      { Match: "C vs D", Bet: "[地图2] 获胜" },
    )).toBe(false);
    expect(isSameOrderMatchMap(
      { Match: "A vs B", Bet: "未知盘口" },
      { Match: "A vs B", Bet: "未知盘口" },
    )).toBe(false);
  });

  it("isSameOrderMatchMap tolerates PM LoL/Game suffix vs venue title", () => {
    expect(isSameOrderMatchMap(
      {
        Match: "LoL: Team Secret vs Karmine Corp - Game 2 Winner",
        Bet: "地图2",
      },
      {
        Match: "Team Secret vs Karmine Corp",
        Bet: "[地图2]单局 - 获胜",
      },
    )).toBe(true);
  });

  it("canRebindOrderOnto only checks newer→older link", () => {
    const older = 1_700_000_000_100;
    const newer = 1_700_000_000_200;
    expect(canRebindOrderOnto(
      { Link: newer },
      { Link: older },
    )).toBe(true);
    expect(canRebindOrderOnto(
      { Link: newer },
      { Link: older },
    )).toBe(true);
    expect(canRebindOrderOnto(
      { Link: older },
      { Link: newer },
    )).toBe(false);
  });

  it("isRebindableOrderRow excludes makeup synthetics", () => {
    expect(isRebindableOrderRow({
      OrderID: "real-1",
      Link: 1_700_000_000_100,
      Type: "OB",
      Status: "Win",
    } as any)).toBe(true);
    expect(isRebindableOrderRow({
      OrderID: "makeup-42",
      Link: 1_700_000_000_100,
      Status: "Makeup",
    } as any)).toBe(false);
  });
});
