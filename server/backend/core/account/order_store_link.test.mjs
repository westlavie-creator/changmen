import { beforeEach, describe, expect, it, vi } from "vitest";

import { alignRawPredictionSellLinksToBuys, listByDatePage, saveOrder } from "./order_store.js";

const fetchOrdersByPlayerOrderIds = vi.hoisted(() => vi.fn(async () => []));
const upsertOrders = vi.hoisted(() => vi.fn(async () => true));
const fetchOrdersByDatePage = vi.hoisted(() => vi.fn(async () => ({ rows: [], total: 0 })));
const fetchOrdersByLinks = vi.hoisted(() => vi.fn(async () => []));
const fetchOrdersByUserOrderIds = vi.hoisted(() => vi.fn(async () => []));
const fetchPredictionSellsByBuyOrderIds = vi.hoisted(() => vi.fn(async () => []));

vi.mock("@changmen/db", async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    fetchOrdersByPlayerOrderIds,
    upsertOrders,
    fetchOrdersByDatePage,
    fetchOrdersByLinks,
    fetchOrdersByUserOrderIds,
    fetchPredictionSellsByBuyOrderIds,
  };
});

describe("saveOrder backend bind link", () => {
  beforeEach(() => {
    fetchOrdersByPlayerOrderIds.mockReset();
    upsertOrders.mockReset();
    fetchOrdersByDatePage.mockReset();
    fetchOrdersByLinks.mockReset();
    fetchOrdersByUserOrderIds.mockReset();
    fetchPredictionSellsByBuyOrderIds.mockReset();
    fetchOrdersByPlayerOrderIds.mockResolvedValue([]);
    upsertOrders.mockResolvedValue(true);
    fetchOrdersByDatePage.mockResolvedValue({ rows: [], total: 0 });
    fetchOrdersByLinks.mockResolvedValue([]);
    fetchOrdersByUserOrderIds.mockResolvedValue([]);
    fetchPredictionSellsByBuyOrderIds.mockResolvedValue([]);
  });

  it("sets link just before create_at for new unbound order", async () => {
    const createAt = 1_781_882_462_790;
    await saveOrder(
      7,
      [{ orderId: "venue-1", createAt, provider: "OB", status: "Pending" }],
      "user-1",
    );

    expect(upsertOrders).toHaveBeenCalledOnce();
    const row = upsertOrders.mock.calls[0][0][0];
    expect(row.link).toBe(createAt - 1);
    expect(row.link).toBeLessThan(createAt);
    expect(row.create_at).toBe(createAt);
  });

  it("keeps existing bound link on re-save", async () => {
    const createAt = 1_781_882_462_790;
    const arbLink = 1_781_882_500_000;
    fetchOrdersByPlayerOrderIds.mockResolvedValue([
      { order_id: "venue-1", link: arbLink, create_at: createAt },
    ]);

    await saveOrder(
      7,
      [{ orderId: "venue-1", createAt, provider: "OB" }],
      "user-1",
    );

    const row = upsertOrders.mock.calls[0][0][0];
    expect(row.link).toBe(arbLink);
  });

  it("writes incoming client link on first save (shorten placeholder)", async () => {
    const createAt = 1_781_882_462_790;
    const arbLink = 1_781_882_500_123;
    await saveOrder(
      7,
      [{ orderId: "venue-1", createAt, provider: "OB", link: arbLink }],
      "user-1",
    );

    const row = upsertOrders.mock.calls[0][0][0];
    expect(row.link).toBe(arbLink);
  });

  it("does not let incoming link overwrite existing arb bind", async () => {
    const createAt = 1_781_882_462_790;
    const arbLink = 1_781_882_500_000;
    fetchOrdersByPlayerOrderIds.mockResolvedValue([
      { order_id: "venue-1", link: arbLink, create_at: createAt },
    ]);

    await saveOrder(
      7,
      [{ orderId: "venue-1", createAt, provider: "OB", link: 1_781_882_999_999 }],
      "user-1",
    );

    const row = upsertOrders.mock.calls[0][0][0];
    expect(row.link).toBe(arbLink);
  });

  it("backend-binds when existing link is 0", async () => {
    const createAt = 1_781_882_462_790;
    fetchOrdersByPlayerOrderIds.mockResolvedValue([
      { order_id: "venue-2", link: 0, create_at: createAt },
    ]);

    await saveOrder(
      7,
      [{ orderId: "venue-2", createAt, provider: "RAY" }],
      "user-1",
    );

    const row = upsertOrders.mock.calls[0][0][0];
    expect(row.link).toBe(createAt - 1);
  });

  it("PM sell orders follow buy Link and are saved", async () => {
    fetchOrdersByPlayerOrderIds.mockResolvedValue([
      {
        order_id: "0xbuy98",
        link: 1_781_308_466_999,
        create_at: 1_781_308_466_000,
        bet_money: 100,
        raw: {
          pmSide: "buy",
          pmOrigin: "changmen",
          pmShares: 20,
        },
      },
      {
        order_id: "0xsell98",
        link: 0,
        create_at: 1_781_308_467_000,
        bet_money: 0,
        raw: {},
      },
    ]);

    await saveOrder(
      47,
      [{
        orderId: "0xsell98",
        createAt: 1_781_308_467_000,
        provider: "Polymarket",
        pmSide: "sell",
        pmOrigin: "changmen",
        pmBuyOrderId: "0xbuy98",
        pmStakeUsdc: 14,
        betMoney: 144,
        money: 46,
        odds: 1.1765,
      }],
      "user-1",
    );

    expect(upsertOrders).toHaveBeenCalled();
    const row = upsertOrders.mock.calls[0][0][0];
    expect(row.order_id).toBe("0xsell98");
    expect(row.link).toBe(1_781_308_466_999);
    expect(row.raw.pmSide).toBe("sell");
    expect(row.raw.pmBuyOrderId).toBe("0xbuy98");
  });

  it("PM sell follows buy Link across days via pmBuyOrderId (case-insensitive)", async () => {
    const buyLink = 1_781_300_000_001;
    fetchOrdersByPlayerOrderIds.mockResolvedValue([
      {
        order_id: "0xBUYYesterday",
        link: buyLink,
        create_at: 1_781_300_000_000,
        raw: { pmSide: "buy", pmOrigin: "changmen" },
      },
    ]);

    await saveOrder(
      47,
      [{
        orderId: "0xsellToday",
        createAt: 1_781_390_000_000,
        provider: "Polymarket",
        pmSide: "sell",
        pmOrigin: "changmen",
        pmBuyOrderId: "0xbuyyesterday",
        link: buyLink,
        betMoney: 50,
        money: 10,
      }],
      "user-1",
    );

    const row = upsertOrders.mock.calls[0][0][0];
    expect(row.link).toBe(buyLink);
  });

  it("PM sell uses client link when buy row missing from prefetch", async () => {
    const buyLink = 1_781_300_000_222;
    fetchOrdersByPlayerOrderIds.mockResolvedValue([]);

    await saveOrder(
      47,
      [{
        orderId: "0xsellOrphan",
        createAt: 1_781_390_000_000,
        provider: "Polymarket",
        pmSide: "sell",
        pmOrigin: "changmen",
        pmBuyOrderId: "0xmissingBuy",
        link: buyLink,
        betMoney: 50,
        money: 10,
      }],
      "user-1",
    );

    const row = upsertOrders.mock.calls[0][0][0];
    expect(row.link).toBe(buyLink);
  });

  it("PM changmen buy restores pmShares from CLOB when RDS stored zero", async () => {
    fetchOrdersByPlayerOrderIds.mockResolvedValue([
      {
        order_id: "0xbuy70",
        link: 1_781_304_306_999,
        create_at: 1_781_304_307_000,
        bet_money: 70,
        money: 36,
        status: "Win",
        raw: {
          pmSide: "buy",
          pmOrigin: "changmen",
          pmShares: 0,
          pmStakeUsdc: 0,
          pmSellState: "closed",
          pmAttributedSellShares: 15.15,
        },
      },
    ]);

    await saveOrder(
      47,
      [{
        orderId: "0xbuy70",
        createAt: 1_781_304_307_000,
        provider: "Polymarket",
        pmSide: "buy",
        pmOrigin: "changmen",
        pmShares: 15.1515,
        pmStakeUsdc: 0,
        pmSellState: "settled",
        betMoney: 70,
        money: 36,
        odds: 1.5152,
        status: "win",
      }],
      "user-1",
    );

    const row = upsertOrders.mock.calls[0][0][0];
    expect(row.raw.pmShares).toBe(15.1515);
  });

  it("PM changmen buy with open attr allows incoming Win settlement", async () => {
    fetchOrdersByPlayerOrderIds.mockResolvedValue([
      {
        order_id: "0xbuy-nrg",
        link: 1_783_200_396_999,
        create_at: 1_783_200_397_000,
        bet_money: 126,
        money: 0,
        status: "None",
        raw: {
          pmSide: "buy",
          pmOrigin: "changmen",
          pmShares: 36,
          pmStakeUsdc: 18,
          pmSellState: "open",
          pmAttributedSellShares: 36,
        },
      },
    ]);

    await saveOrder(
      47,
      [{
        orderId: "0xbuy-nrg",
        createAt: 1_783_200_397_000,
        provider: "Polymarket",
        pmSide: "buy",
        pmOrigin: "changmen",
        pmShares: 36,
        pmStakeUsdc: 18,
        pmSellState: "settled",
        betMoney: 126,
        money: 126,
        odds: 2,
        status: "win",
      }],
      "user-1",
    );

    const row = upsertOrders.mock.calls[0][0][0];
    expect(row.status).toBe("Win");
    expect(row.money).toBe(126);
    expect(row.raw.pmSellState).toBe("settled");
  });

  it("PM manually closed buy rejects Gamma Win money (keep buy sell PnL)", async () => {
    fetchOrdersByPlayerOrderIds.mockResolvedValue([
      {
        order_id: "0xbuy-closed",
        link: 1_784_389_005_296,
        create_at: 1_784_389_000_000,
        bet_money: 200,
        money: 184,
        status: "None",
        raw: {
          pmSide: "buy",
          pmOrigin: "changmen",
          pmShares: 56.55,
          pmStakeUsdc: 0,
          pmSellState: "closed",
          pmAttributedSellShares: 56.55,
          money: 184,
        },
      },
    ]);

    await saveOrder(
      47,
      [{
        orderId: "0xbuy-closed",
        createAt: 1_784_389_000_000,
        provider: "Polymarket",
        pmSide: "buy",
        pmOrigin: "changmen",
        pmShares: 56.55,
        pmStakeUsdc: 0,
        pmSellState: "settled",
        pmAttributedSellShares: 56.55,
        betMoney: 200,
        money: 999,
        status: "win",
      }],
      "user-1",
    );

    const row = upsertOrders.mock.calls[0][0][0];
    // 已 closed：保留卖出累计盈亏，拒绝 Gamma 覆写
    expect(row.money).toBe(184);
    expect(row.status).toBe("None");
    expect(row.raw.pmSellState).toBe("closed");
  });

  it("PM manually closed buy still accepts pmMatchResult without changing money/status", async () => {
    fetchOrdersByPlayerOrderIds.mockResolvedValue([
      {
        order_id: "0xbuy-closed-mr",
        link: 1_784_389_005_296,
        create_at: 1_784_389_000_000,
        bet_money: 200,
        money: 184,
        status: "None",
        raw: {
          pmSide: "buy",
          pmOrigin: "changmen",
          pmShares: 56.55,
          pmStakeUsdc: 0,
          pmSellState: "closed",
          pmAttributedSellShares: 56.55,
          money: 184,
        },
      },
    ]);

    await saveOrder(
      47,
      [{
        orderId: "0xbuy-closed-mr",
        createAt: 1_784_389_000_000,
        provider: "Polymarket",
        pmSide: "buy",
        pmOrigin: "changmen",
        pmShares: 56.55,
        pmStakeUsdc: 0,
        pmSellState: "closed",
        pmAttributedSellShares: 56.55,
        pmMatchResult: "lose",
        betMoney: 200,
        money: 999,
        status: "win",
      }],
      "user-1",
    );

    const row = upsertOrders.mock.calls[0][0][0];
    expect(row.money).toBe(184);
    expect(row.status).toBe("None");
    expect(row.raw.pmSellState).toBe("closed");
    expect(row.raw.pmMatchResult).toBe("lose");
  });

  it("PM settled open buy keeps prev pmMatchResult when incoming omits it", async () => {
    fetchOrdersByPlayerOrderIds.mockResolvedValue([
      {
        order_id: "0xbuy-settled-mr",
        link: 1_784_389_005_297,
        create_at: 1_784_389_000_000,
        bet_money: 100,
        money: 50,
        status: "Win",
        raw: {
          pmSide: "buy",
          pmOrigin: "changmen",
          pmShares: 20,
          pmStakeUsdc: 14.7,
          pmSellState: "settled",
          pmMatchResult: "win",
          money: 50,
        },
      },
    ]);

    await saveOrder(
      47,
      [{
        orderId: "0xbuy-settled-mr",
        createAt: 1_784_389_000_000,
        provider: "Polymarket",
        pmSide: "buy",
        pmOrigin: "changmen",
        pmShares: 20,
        pmStakeUsdc: 14.7,
        pmSellState: "settled",
        betMoney: 100,
        money: 50,
        status: "win",
      }],
      "user-1",
    );

    const row = upsertOrders.mock.calls[0][0][0];
    expect(row.status).toBe("Win");
    expect(row.money).toBe(50);
    expect(row.raw.pmMatchResult).toBe("win");
  });
});

describe("listByDatePage link siblings", () => {
  beforeEach(() => {
    fetchOrdersByDatePage.mockReset();
    fetchOrdersByLinks.mockReset();
    fetchOrdersByUserOrderIds.mockReset();
    fetchPredictionSellsByBuyOrderIds.mockReset();
    fetchOrdersByUserOrderIds.mockResolvedValue([]);
    fetchPredictionSellsByBuyOrderIds.mockResolvedValue([]);
  });

  const buyAt = Date.parse("2026-07-18T15:36:00+08:00");
  const sellAt = Date.parse("2026-07-19T00:24:00+08:00");
  const buyDay = "2026-07-18";
  const sellDay = "2026-07-19";
  const buyYday = {
    order_id: "0xbuyYday",
    link: 1_781_300_000_999,
    create_at: buyAt,
    player_id: 47,
    provider: "Polymarket",
    bet_money: 100,
    money: 0,
    status: "None",
    raw: { pmSide: "buy", pmOrigin: "changmen", pmSellState: "closed" },
  };
  const sellToday = {
    order_id: "0xsellToday",
    link: 1_781_300_000_999,
    create_at: sellAt,
    player_id: 47,
    provider: "Polymarket",
    bet_money: 50,
    money: 10,
    status: "None",
    raw: { pmSide: "sell", pmBuyOrderId: "0xbuyYday", pmOrigin: "changmen" },
  };

  it("on buy day merges next-day sell into the same Link group", async () => {
    const link = buyYday.link;
    fetchOrdersByDatePage.mockResolvedValue({
      rows: [buyYday],
      total: 1,
    });
    fetchOrdersByLinks.mockResolvedValue([buyYday, sellToday]);

    const { list, total } = await listByDatePage(buyDay, "user-1", 1, 1024);
    // total 以 enrich 后实际条数为准（并入跨日卖单）
    expect(total).toBe(2);
    expect(list.map(r => r.OrderID).sort()).toEqual(["0xbuyYday", "0xsellToday"]);
    expect(list.every(r => r.Link === link)).toBe(true);
    expect(fetchOrdersByLinks).toHaveBeenCalledWith("user-1", [link]);
  });

  it("on sell day does not show sell alone (belongs to buy day)", async () => {
    fetchOrdersByDatePage.mockResolvedValue({
      rows: [sellToday],
      total: 1,
    });
    fetchOrdersByLinks.mockResolvedValue([buyYday, sellToday]);

    const { list } = await listByDatePage(sellDay, "user-1", 1, 1024);
    expect(list).toEqual([]);
  });

  it("on buy day merges cross-day sell even when sell.link diverges (by pmBuyOrderId)", async () => {
    const buyLink = 1_781_300_000_200;
    const sellWrongLink = 1_781_300_000_100;
    const buy = {
      ...buyYday,
      link: buyLink,
      user_id: "user-1",
    };
    const sell = {
      ...sellToday,
      link: sellWrongLink,
      user_id: "user-1",
      raw: { pmSide: "sell", pmBuyOrderId: "0xbuyYday", pmOrigin: "changmen" },
    };
    fetchOrdersByDatePage.mockResolvedValue({ rows: [buy], total: 1 });
    fetchOrdersByLinks.mockResolvedValue([buy]);
    fetchPredictionSellsByBuyOrderIds.mockResolvedValue([sell]);

    const { list } = await listByDatePage(buyDay, "user-1", 1, 1024);
    expect(list.map(r => r.OrderID).sort()).toEqual(["0xbuyYday", "0xsellToday"]);
    expect(list.find(r => r.OrderID === "0xsellToday")?.Link).toBe(buyLink);
    expect(fetchPredictionSellsByBuyOrderIds).toHaveBeenCalledWith("user-1", ["0xbuyYday"]);
  });

  it("on sell day pulls parent buy by pmBuyOrderId then hides (belongs to buy day)", async () => {
    const buyLink = 1_781_300_000_200;
    const sellWrongLink = 1_781_300_000_100;
    const buy = {
      ...buyYday,
      link: buyLink,
      user_id: "user-1",
    };
    const sell = {
      ...sellToday,
      link: sellWrongLink,
      user_id: "user-1",
      raw: { pmSide: "sell", pmBuyOrderId: "0xbuyYday", pmOrigin: "changmen" },
    };
    fetchOrdersByDatePage.mockResolvedValue({ rows: [sell], total: 1 });
    fetchOrdersByLinks.mockResolvedValue([sell]);
    fetchOrdersByUserOrderIds.mockResolvedValue([buy]);
    fetchPredictionSellsByBuyOrderIds.mockResolvedValue([sell]);

    const { list } = await listByDatePage(sellDay, "user-1", 1, 1024);
    expect(list).toEqual([]);
    expect(fetchOrdersByUserOrderIds).toHaveBeenCalledWith("user-1", ["0xbuyYday"]);
  });

  it("alignRawPredictionSellLinksToBuys splits link=0 buys by create_at placeholder", () => {
    const buyAt1 = Date.parse("2026-07-18T12:00:00+08:00");
    const buyAt2 = Date.parse("2026-07-19T12:00:00+08:00");
    const rows = alignRawPredictionSellLinksToBuys([
      {
        order_id: "buy1",
        link: 0,
        create_at: buyAt1,
        provider: "Polymarket",
        raw: { pmSide: "buy" },
      },
      {
        order_id: "buy2",
        link: 0,
        create_at: buyAt2,
        provider: "Polymarket",
        raw: { pmSide: "buy" },
      },
      {
        order_id: "sell1",
        link: 99,
        create_at: buyAt1 + 1000,
        provider: "Polymarket",
        raw: { pmSide: "sell", pmBuyOrderId: "buy1" },
      },
      {
        order_id: "sell2",
        link: 88,
        create_at: buyAt2 + 1000,
        provider: "Polymarket",
        raw: { pmSide: "sell", pmBuyOrderId: "buy2" },
      },
    ]);
    const b1 = rows.find(r => r.order_id === "buy1");
    const b2 = rows.find(r => r.order_id === "buy2");
    const s1 = rows.find(r => r.order_id === "sell1");
    const s2 = rows.find(r => r.order_id === "sell2");
    expect(Number(b1.link)).toBe(buyAt1);
    expect(Number(b2.link)).toBe(buyAt2);
    expect(b1.link).not.toBe(b2.link);
    expect(s1.link).toBe(b1.link);
    expect(s2.link).toBe(b2.link);
  });

  it("keeps cross-day arb siblings when there is no PM sell", async () => {
    const ydayAt = Date.parse("2026-07-18T12:00:00+08:00");
    const todayAt = Date.parse("2026-07-19T12:00:00+08:00");
    const ob = {
      order_id: "ob-1",
      link: 42,
      create_at: ydayAt,
      player_id: 1,
      provider: "OB",
      bet_money: 100,
      money: 5,
      status: "Win",
      raw: {},
    };
    const pm = {
      order_id: "pm-1",
      link: 42,
      create_at: todayAt,
      player_id: 1,
      provider: "Polymarket",
      bet_money: 100,
      money: 0,
      status: "None",
      raw: { pmSide: "buy" },
    };
    fetchOrdersByDatePage.mockResolvedValue({ rows: [pm], total: 1 });
    fetchOrdersByLinks.mockResolvedValue([ob, pm]);
    const { list } = await listByDatePage("2026-07-19", "user-1", 1, 1024);
    expect(list.map(r => r.OrderID).sort()).toEqual(["ob-1", "pm-1"]);
  });
});
