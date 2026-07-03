import { describe, expect, test } from "vitest";
import {
  aggregatePolymarketTrades,
  applyPolymarketNetPositions,
  applyPolymarketSettlement,
  flattenPolymarketTrades,
  isPolymarketMarketResolved,
  isPolymarketTradeConfirmed,
  isUserMakerOrderLeg,
  mapPolymarketTradeToVenueOrder,
  mapPolymarketTradesToVenueOrders,
  polymarketBuyStakeUsdc,
  polymarketTradeRefsOrderId,
  resolvePolymarketWinningAssetId,
  type PolymarketTradeRow,
} from "./orders";
import { collectPolymarketUserAddresses } from "./l2Auth";
import { polymarketOrderContextFromMarket, type PolymarketRawMarket } from "./parse";

describe("isPolymarketTradeConfirmed", () => {
  test("accepts confirmed, matched, and mined statuses", () => {
    expect(isPolymarketTradeConfirmed("TRADE_STATUS_CONFIRMED")).toBe(true);
    expect(isPolymarketTradeConfirmed("MATCHED")).toBe(true);
    expect(isPolymarketTradeConfirmed("MINED")).toBe(true);
    expect(isPolymarketTradeConfirmed("RETRYING")).toBe(true);
  });

  test("rejects failed and cancelled statuses", () => {
    expect(isPolymarketTradeConfirmed("TRADE_STATUS_FAILED")).toBe(false);
    expect(isPolymarketTradeConfirmed("CANCELLED")).toBe(false);
  });
});

describe("polymarketTradeRefsOrderId", () => {
  test("matches taker_order_id and maker_orders.order_id", () => {
    const trade: PolymarketTradeRow = {
      taker_order_id: "0xTaker",
      maker_orders: [{ order_id: "0xMaker" }],
    };
    expect(polymarketTradeRefsOrderId(trade, "0xTaker")).toBe(true);
    expect(polymarketTradeRefsOrderId(trade, "0xMaker")).toBe(true);
    expect(polymarketTradeRefsOrderId(trade, "0xOther")).toBe(false);
  });
});

describe("polymarketBuyStakeUsdc", () => {
  test("parses micro token size from REST", () => {
    expect(polymarketBuyStakeUsdc("2000000", 0.5)).toBe(1);
  });

  test("parses human-readable share size from WS-like payloads", () => {
    expect(polymarketBuyStakeUsdc("10", 0.57)).toBeCloseTo(5.7, 4);
  });
});

describe("flattenPolymarketTrades", () => {
  test("uses maker_orders when trader_side is MAKER", () => {
    const rows = flattenPolymarketTrades([{
      trader_side: "MAKER",
      side: "BUY",
      status: "MINED",
      match_time: "1700000000",
      market: "0xmarket",
      taker_order_id: "0xtaker",
      maker_orders: [{
        order_id: "0xmaker-order",
        matched_amount: "2000000",
        price: "0.5",
        outcome: "Team A",
      }],
    }]);

    expect(rows).toHaveLength(1);
    expect(rows[0]?.taker_order_id).toBe("0xmaker-order");
  });

  test("drops counterparty maker_orders when user funder address is known (Ilbirs sell case)", () => {
    const userFunder = "0x3eDBB2D5649B2c07eeFe12fBFe2c733F148C11b8";
    const userAddresses = collectPolymarketUserAddresses({ funder: userFunder });
    const trade: PolymarketTradeRow = {
      trader_side: "MAKER",
      side: "BUY",
      status: "CONFIRMED",
      match_time: "1782822352",
      market: "0x222f98de2a15f629d45d61be7fc4809073b8e2b6a75820fa01651b6879087d0e",
      outcome: "Ilbirs eSports",
      asset_id: "43096664925939890021156714357110646049434267308263392569206421178711872585554",
      maker_orders: [
        {
          order_id: "0x137f92c989118f5a7a470d87e55da48292b5641ca4f726e56e6e2a482c43e65a",
          maker_address: userFunder,
          matched_amount: "23.24",
          price: "0.98",
          outcome: "Ilbirs eSports",
          side: "SELL",
          asset_id: "43096664925939890021156714357110646049434267308263392569206421178711872585554",
        },
        {
          order_id: "0x98ea21507110d22510ef8304af599767f0d31f854ee8c2fd05140e9187548d47",
          maker_address: "0xA951006f1Ce68498C1aeF9b013880459E6E08A2F",
          matched_amount: "15",
          price: "0.02",
          outcome: "Habibis",
          side: "BUY",
          asset_id: "39946498812908425907742353673510535035587445185779665944258669737953419673215",
        },
        {
          order_id: "0x51b0dfee5f74e2b6ee58d0e7c65eeb7972218deaf7492b912121e429f156bbb2",
          maker_address: "0x47dE133e5b7641d8F3aa36e0a750C6C9b1d9B677",
          matched_amount: "604.0773",
          price: "0.01",
          outcome: "Habibis",
          side: "BUY",
          asset_id: "39946498812908425907742353673510535035587445185779665944258669737953419673215",
        },
      ],
    };

    const rows = flattenPolymarketTrades([trade], userAddresses);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.taker_order_id).toBe("0x137f92c989118f5a7a470d87e55da48292b5641ca4f726e56e6e2a482c43e65a");
    expect(rows[0]?.side).toBe("SELL");
    expect(isUserMakerOrderLeg(trade.maker_orders![1]!, trade, userAddresses)).toBe(false);

    const orders = mapPolymarketTradesToVenueOrders([trade], new Map(), 0, userAddresses);
    expect(orders).toHaveLength(0);
  });
});

describe("aggregatePolymarketTrades", () => {
  test("merges bucket trades by taker_order_id and ignores sells", () => {
    const trades: PolymarketTradeRow[] = [
      {
        taker_order_id: "0xabc",
        side: "BUY",
        status: "TRADE_STATUS_CONFIRMED",
        size: "500000",
        price: "0.5",
        match_time: "1700000000",
        outcome: "Team A",
      },
      {
        taker_order_id: "0xabc",
        side: "BUY",
        status: "TRADE_STATUS_CONFIRMED",
        size: "500000",
        price: "0.5",
        match_time: "1700000001",
        outcome: "Team A",
        bucket_index: 1,
      },
      {
        taker_order_id: "0xsell",
        side: "SELL",
        status: "TRADE_STATUS_CONFIRMED",
        size: "1000000",
        price: "0.5",
        match_time: "1700000002",
      },
    ];

    const aggregated = aggregatePolymarketTrades(trades);
    expect(aggregated).toHaveLength(1);
    expect(aggregated[0]?.taker_order_id).toBe("0xabc");
    expect(aggregated[0]?.size).toBe("1000000");
    expect(aggregated[0]?.price).toBe("0.5");
    expect(aggregated[0]?.match_time).toBe("1700000001");
  });

  test("merges buckets with VWAP price when fill prices differ", () => {
    const trades: PolymarketTradeRow[] = [
      {
        taker_order_id: "0xabc",
        side: "BUY",
        status: "TRADE_STATUS_CONFIRMED",
        size: "10",
        price: "0.4",
        match_time: "1700000000",
        bucket_index: 0,
      },
      {
        taker_order_id: "0xabc",
        side: "BUY",
        status: "TRADE_STATUS_CONFIRMED",
        size: "10",
        price: "0.5",
        match_time: "1700000001",
        bucket_index: 1,
      },
    ];

    const aggregated = aggregatePolymarketTrades(trades);
    expect(aggregated).toHaveLength(1);
    expect(aggregated[0]?.size).toBe("20");
    expect(aggregated[0]?.price).toBe("0.45");
    expect(mapPolymarketTradeToVenueOrder(aggregated[0]!)).toMatchObject({
      betMoney: 9,
      odds: 2.2222,
    });
  });
});

describe("mapPolymarketTradeToVenueOrder", () => {
  test("maps MINED BUY trade to unsettled VenueOrder", () => {
    const order = mapPolymarketTradeToVenueOrder({
      taker_order_id: "0xorder-mined",
      market: "0xmarket",
      side: "BUY",
      status: "MINED",
      size: "10",
      price: "0.5",
      match_time: "1700000000",
      outcome: "Team A",
    });

    expect(order).toMatchObject({
      orderId: "0xorder-mined",
      betMoney: 5,
      status: "none",
    });
  });

  test("maps BUY trade to unsettled VenueOrder", () => {
    const market = {
      condition_id: "0xmarket",
      question: "Counter-Strike: Team A vs Team B (BO3)",
      sports_market_type: "child_moneyline",
      group_item_title: "Map 1 Winner",
      tags: [{ label: "cs2" }],
    };

    const order = mapPolymarketTradeToVenueOrder({
      taker_order_id: "0xorder1",
      market: "0xmarket",
      side: "BUY",
      status: "TRADE_STATUS_CONFIRMED",
      size: "2000000",
      price: "0.5",
      match_time: "1700000000",
      outcome: "Team A",
    }, market);

    expect(order).toMatchObject({
      provider: "Polymarket",
      orderId: "0xorder1",
      odds: 2,
      betMoney: 1,
      reward: 2,
      money: 0,
      status: "none",
      game: "cs2",
      match: "Counter-Strike: Team A vs Team B (BO3)",
      bet: "地图1",
      item: "Team A",
      createAt: 1_700_000_000_000,
    });
  });

  test("falls back when gamma market is missing", () => {
    const order = mapPolymarketTradeToVenueOrder({
      taker_order_id: "0xorder2",
      market: "0x1234567890",
      side: "BUY",
      status: "MATCHED",
      size: "1000000",
      price: "0.25",
      match_time: "1700000100",
      outcome: "Yes",
    });

    expect(order?.match).toBe("0x12345678…");
    expect(order?.bet).toBe("");
    expect(order?.odds).toBe(4);
    expect(order?.betMoney).toBe(0.25);
  });
});

describe("polymarketOrderContextFromMarket", () => {
  test("labels moneyline as 全场", () => {
    expect(polymarketOrderContextFromMarket({
      question: "Match winner",
      sports_market_type: "moneyline",
      tags: [{ label: "lol" }],
    })).toMatchObject({
      game: "lol",
      bet: "全场",
    });
  });
});

describe("mapPolymarketTradesToVenueOrders", () => {
  const ilbirsTrade: PolymarketTradeRow = {
    taker_order_id: "0xf6ce662fe4d026b86430fc49e29bc3600db21d76ef69fcb7e0230689289d8a53",
    market: "0xfaf8d69ad2f0677b6f987e7da1c94022f73073120e9ed28969fcf5153475116f",
    asset_id: "12876938733604859423663202044051912631612545733461708116502231340403727260024",
    side: "BUY",
    size: "6.756753",
    price: "0.74",
    status: "CONFIRMED",
    match_time: "1782736191",
    outcome: "Ilbirs eSports",
    trader_side: "TAKER",
  };

  const ilbirsMarket: PolymarketRawMarket = {
    condition_id: "0xfaf8d69ad2f0677b6f987e7da1c94022f73073120e9ed28969fcf5153475116f",
    question: "Ilbirs vs BALU Map 1",
    closed: true,
    outcomes: "[\"Ilbirs eSports\", \"BALU\"]",
    outcomePrices: "[\"1\", \"0\"]",
    clobTokenIds: "[\"12876938733604859423663202044051912631612545733461708116502231340403727260024\", \"64898223322413645971505217367611485629461864230905813190263318936513341854768\"]",
  };

  test("maps production CLOB decimal share sizes (Ilbirs sample)", () => {
    const order = mapPolymarketTradeToVenueOrder(ilbirsTrade);

    expect(order).toMatchObject({
      orderId: "0xf6ce662fe4d026b86430fc49e29bc3600db21d76ef69fcb7e0230689289d8a53",
      betMoney: 5,
      odds: 1.3514,
      item: "Ilbirs eSports",
      createAt: 1_782_736_191_000,
      status: "none",
      pmTokenId: "12876938733604859423663202044051912631612545733461708116502231340403727260024",
      pmShares: 6.7568,
      pmStakeUsdc: 5,
    });
  });

  test("settles Ilbirs BUY as win when Gamma market resolved", () => {
    const [order] = mapPolymarketTradesToVenueOrders(
      [ilbirsTrade],
      new Map([[String(ilbirsMarket.condition_id), ilbirsMarket]]),
    );

    expect(order).toMatchObject({
      status: "win",
      betMoney: 5,
      reward: 6.7568,
      money: 1.7568,
    });
  });

  test("settles Ilbirs BUY as lose when opponent token wins", () => {
    const lostMarket: PolymarketRawMarket = {
      ...ilbirsMarket,
      outcomePrices: "[\"0\", \"1\"]",
    };
    const [order] = mapPolymarketTradesToVenueOrders(
      [ilbirsTrade],
      new Map([[String(lostMarket.condition_id), lostMarket]]),
    );

    expect(order).toMatchObject({
      status: "lose",
      betMoney: 5,
      reward: 0,
      money: -5,
    });
  });

  test("keeps none when market closed but outcome not finalized", () => {
    const pendingMarket: PolymarketRawMarket = {
      ...ilbirsMarket,
      closed: true,
      outcomePrices: "[\"0.55\", \"0.45\"]",
    };
    expect(isPolymarketMarketResolved(pendingMarket)).toBe(false);
    expect(resolvePolymarketWinningAssetId(pendingMarket)).toBeNull();

    const [order] = mapPolymarketTradesToVenueOrders(
      [ilbirsTrade],
      new Map([[String(pendingMarket.condition_id), pendingMarket]]),
    );
    expect(order?.status).toBe("none");
    expect(order?.money).toBe(0);
  });

  test("keeps none when market still open", () => {
    const openMarket: PolymarketRawMarket = {
      ...ilbirsMarket,
      closed: false,
      outcomePrices: "[\"0.74\", \"0.26\"]",
    };
    const [order] = mapPolymarketTradesToVenueOrders(
      [ilbirsTrade],
      new Map([[String(openMarket.condition_id), openMarket]]),
    );
    expect(order?.status).toBe("none");
  });

  test("settles when closed=false but outcomePrices show clear winner", () => {
    const liveResolvedMarket: PolymarketRawMarket = {
      ...ilbirsMarket,
      closed: false,
      acceptingOrders: true,
      outcomePrices: "[\"0.9995\", \"0.0005\"]",
      umaResolutionStatus: "proposed",
    };
    expect(isPolymarketMarketResolved(liveResolvedMarket)).toBe(true);

    const [order] = mapPolymarketTradesToVenueOrders(
      [ilbirsTrade],
      new Map([[String(liveResolvedMarket.condition_id), liveResolvedMarket]]),
    );
    expect(order?.status).toBe("win");
  });

  test("settles via umaResolutionStatus settled_normal without closed flag", () => {
    const umaMarket: PolymarketRawMarket = {
      ...ilbirsMarket,
      closed: false,
      umaResolutionStatus: "settled_normal",
    };
    const [order] = mapPolymarketTradesToVenueOrders(
      [ilbirsTrade],
      new Map([[String(umaMarket.condition_id), umaMarket]]),
    );
    expect(order?.status).toBe("win");
  });

  test("maps BUY and SELL trades to separate orders", () => {
    const sample: PolymarketTradeRow[] = [
      {
        taker_order_id: "0xbuy1",
        side: "BUY",
        status: "CONFIRMED",
        size: "6.756753",
        price: "0.74",
        match_time: "1782736191",
        outcome: "Ilbirs eSports",
        trader_side: "TAKER",
        asset_id: "asset-a",
      },
      {
        taker_order_id: "0xsell1",
        side: "SELL",
        status: "CONFIRMED",
        size: "6.41",
        price: "0.999",
        match_time: "1782690537",
        outcome: "MIBR Academy",
        trader_side: "TAKER",
        asset_id: "asset-a",
      },
      {
        taker_order_id: "0xbuy2",
        side: "BUY",
        status: "CONFIRMED",
        size: "14.545453",
        price: "0.55",
        match_time: "1782684713",
        outcome: "ShindeN",
        trader_side: "TAKER",
      },
    ];

    const orders = mapPolymarketTradesToVenueOrders(sample);
    expect(orders).toHaveLength(3);
    const buy1 = orders.find(o => o.orderId === "0xbuy1");
    const sell1 = orders.find(o => o.orderId === "0xsell1");
    expect(buy1?.pmSide).toBe("buy");
    expect(buy1?.betMoney).toBe(5);
    expect(sell1?.pmSide).toBe("sell");
    expect(sell1?.betMoney).toBeGreaterThan(0);
    expect(sell1?.pmBuyOrderId).toBe("0xbuy1");
  });
});

describe("applyPolymarketSettlement", () => {
  test("falls back to outcome name when asset_id missing", () => {
    const market: PolymarketRawMarket = {
      closed: true,
      outcomes: "[\"Team A\", \"Team B\"]",
      outcomePrices: "[\"0.999\", \"0.001\"]",
      clobTokenIds: "[\"token-a\", \"token-b\"]",
    };
    const base = {
      provider: "Polymarket" as const,
      orderId: "0x1",
      odds: 2,
      createAt: 1,
      betMoney: 10,
      reward: 20,
      money: 0,
      status: "none" as const,
      game: "",
      match: "",
      bet: "",
      item: "Team A",
    };
    const settled = applyPolymarketSettlement(base, {
      side: "BUY",
      size: "20",
      price: "0.5",
      outcome: "Team A",
    }, market);

    expect(settled.status).toBe("win");
    expect(settled.reward).toBe(20);
    expect(settled.money).toBe(10);
  });

  test("applyPolymarketNetPositions reduces pmShares after SELL trades (FIFO external only)", () => {
    const token = "asset-a";
    const orders = [{
      provider: "Polymarket" as const,
      orderId: "buy-1",
      odds: 2,
      createAt: 1000,
      betMoney: 10,
      reward: 20,
      money: 0,
      status: "none" as const,
      game: "",
      match: "",
      bet: "",
      item: "A",
      pmTokenId: token,
      pmShares: 10,
      pmStakeUsdc: 10,
      pmOrigin: "external" as const,
    }];
    const sells: PolymarketTradeRow[] = [{
      side: "SELL",
      status: "CONFIRMED",
      asset_id: token,
      size: "4",
      price: "0.6",
    }];
    applyPolymarketNetPositions(orders, sells);
    expect(orders[0]?.pmShares).toBe(6);
    expect(orders[0]?.pmStakeUsdc).toBe(6);
    expect(orders[0]?.betMoney).toBe(6);
  });

  test("applyPolymarketNetPositions skips changmen rows", () => {
    const token = "asset-b";
    const orders = [{
      provider: "Polymarket" as const,
      orderId: "buy-cm",
      odds: 2,
      createAt: 1000,
      betMoney: 10,
      reward: 20,
      money: 0,
      status: "none" as const,
      game: "",
      match: "",
      bet: "",
      item: "A",
      pmTokenId: token,
      pmShares: 10,
      pmStakeUsdc: 10,
      pmOrigin: "changmen" as const,
    }];
    const sells: PolymarketTradeRow[] = [{
      side: "SELL",
      status: "CONFIRMED",
      asset_id: token,
      size: "4",
      price: "0.6",
    }];
    applyPolymarketNetPositions(orders, sells);
    expect(orders[0]?.pmShares).toBe(10);
  });
});
