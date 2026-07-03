import { beforeEach, describe, expect, it, vi } from "vitest";

import { saveOrder } from "./order_store.js";

const fetchOrdersByPlayerAll = vi.hoisted(() => vi.fn(async () => []));
const upsertOrders = vi.hoisted(() => vi.fn(async () => true));

vi.mock("@changmen/db", async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    fetchOrdersByPlayerAll,
    upsertOrders,
  };
});

describe("saveOrder backend bind link", () => {
  beforeEach(() => {
    fetchOrdersByPlayerAll.mockReset();
    upsertOrders.mockReset();
    fetchOrdersByPlayerAll.mockResolvedValue([]);
    upsertOrders.mockResolvedValue(true);
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
    fetchOrdersByPlayerAll.mockResolvedValue([
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

  it("backend-binds when existing link is 0", async () => {
    const createAt = 1_781_882_462_790;
    fetchOrdersByPlayerAll.mockResolvedValue([
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

  it("PM external sell accepts incoming pmBuyOrderId over stale RDS", async () => {
    const buy70Link = 1_781_304_306_999;
    const buy98Link = 1_781_304_468_251;
    fetchOrdersByPlayerAll.mockResolvedValue([
      {
        order_id: "0xbuy70",
        link: buy70Link,
        create_at: 1_781_304_307_000,
        bet_money: 70,
        raw: { pmSide: "buy", pmOrigin: "changmen" },
      },
      {
        order_id: "0xbuy98",
        link: buy98Link,
        create_at: 1_781_304_471_000,
        bet_money: 98,
        raw: { pmSide: "buy", pmOrigin: "changmen" },
      },
      {
        order_id: "0xsell98",
        link: 1_781_308_466_999,
        create_at: 1_781_308_467_000,
        bet_money: 144,
        raw: {
          pmSide: "sell",
          pmOrigin: "external",
          pmBuyOrderId: "0xbuy70",
          pmStakeUsdc: 0.001,
        },
      },
    ]);

    await saveOrder(
      47,
      [{
        orderId: "0xsell98",
        createAt: 1_781_308_467_000,
        provider: "Polymarket",
        pmSide: "sell",
        pmOrigin: "external",
        pmBuyOrderId: "0xbuy98",
        pmStakeUsdc: 14,
        betMoney: 144,
        money: 46,
        odds: 1.1765,
      }],
      "user-1",
    );

    const row = upsertOrders.mock.calls[0][0][0];
    expect(row.raw.pmBuyOrderId).toBe("0xbuy98");
    expect(row.raw.pmStakeUsdc).toBe(14);
    expect(row.link).toBe(buy98Link);
  });
});
