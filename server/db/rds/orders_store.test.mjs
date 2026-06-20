import { describe, expect, it, vi, beforeEach } from "vitest";

const queryMock = vi.fn();
const clientQueryMock = vi.fn();
const connectMock = vi.fn(async () => ({
  query: clientQueryMock,
  release: vi.fn(),
}));

vi.mock("./common.js", () => ({
  getPgPool: () => ({ query: queryMock, connect: connectMock }),
  _jsonb: (val, fallback) => JSON.stringify(val ?? fallback ?? null),
}));

import {
  fetchOrdersByDate,
  fetchOrdersByPlayer,
  fetchOrdersByPlayerAll,
  setOrdersBoundHook,
  updateOrderBind,
  upsertOrders,
} from "./orders_store.js";

describe("orders_store read SQL", () => {
  beforeEach(() => {
    queryMock.mockReset();
    setOrdersBoundHook(null);
  });

  it("fetchOrdersByDate returns all orders (no filter)", async () => {
    queryMock.mockResolvedValue({ rows: [] });
    await fetchOrdersByDate("2026-06-18", "user-1");
    expect(queryMock).toHaveBeenCalledOnce();
    const [sql] = queryMock.mock.calls[0];
    expect(sql).not.toMatch(/link\s*<\s*create_at/i);
    expect(sql).not.toMatch(/changmen_bet/i);
  });

  it("fetchOrdersByPlayer returns all orders (no filter)", async () => {
    queryMock.mockResolvedValue({ rows: [] });
    await fetchOrdersByPlayer(7, "user-1");
    const [sql] = queryMock.mock.calls[0];
    expect(sql).not.toMatch(/link\s*<\s*create_at/i);
    expect(sql).not.toMatch(/changmen_bet/i);
  });

  it("fetchOrdersAdminPage returns all orders (no filter)", async () => {
    queryMock.mockResolvedValue({ rows: [{ n: 0 }] });
    await import("./orders_store.js").then((m) =>
      m.fetchOrdersAdminPage({
        dateKey: "2026-06-18",
        pageIndex: 1,
        pageSize: 20,
      }),
    );
    const [sql] = queryMock.mock.calls[0];
    expect(sql).not.toMatch(/link\s*<\s*create_at/i);
    expect(sql).not.toMatch(/changmen_bet/i);
  });

  it("fetchOrdersByPlayerAll returns all orders (saveOrder internal)", async () => {
    queryMock.mockResolvedValue({ rows: [] });
    await fetchOrdersByPlayerAll(7, "user-1");
    const [sql] = queryMock.mock.calls[0];
    expect(sql).not.toMatch(/link\s*<\s*create_at/i);
    expect(sql).not.toMatch(/changmen_bet/i);
  });
});

describe("upsertOrders SQL", () => {
  beforeEach(() => {
    clientQueryMock.mockReset();
    connectMock.mockClear();
    clientQueryMock.mockResolvedValue({ rows: [{ was_inserted: false }] });
  });

  it("INSERT binds 14 columns including create_at and raw", async () => {
    const ok = await upsertOrders([
      {
        user_id: "u1",
        player_id: 12,
        order_id: "o1",
        link: 1_781_890_412_000,
        provider: "OB",
        match: "A vs B",
        bet: "[地图1]获胜",
        item: "A",
        odds: 1.62,
        bet_money: 100,
        money: -100,
        status: "Lose",
        create_at: 1_781_890_412_099,
        raw: { status: "lose" },
      },
    ]);
    expect(ok).toBe(true);
    expect(connectMock).toHaveBeenCalledOnce();
    const insertCall = clientQueryMock.mock.calls.find(([sql]) => String(sql).includes("INSERT INTO orders"));
    expect(insertCall).toBeDefined();
    const [sql, params] = insertCall;
    expect(sql).toMatch(/\$13,\$14::jsonb/);
    expect(params).toHaveLength(14);
    expect(params[11]).toBe("Lose");
    expect(params[12]).toBe(1_781_890_412_099);
    expect(params[13]).toContain("lose");
  });
});

describe("updateOrderBind bound hook", () => {
  beforeEach(() => {
    queryMock.mockReset();
    setOrdersBoundHook(null);
  });

  it("fires when link changes from create_at placeholder to arb", async () => {
    const ca = 1_781_882_462_790;
    const prev = {
      user_id: "u1",
      order_id: "o1",
      player_id: 7,
      link: ca,
      create_at: ca,
      provider: "OB",
    };
    queryMock
      .mockResolvedValueOnce({ rows: [prev] })
      .mockResolvedValueOnce({ rowCount: 1 });
    const hook = vi.fn();
    setOrdersBoundHook(hook);

    const ok = await updateOrderBind("o1", "u1", 1_700_000_000_000, { provider: "OB" });

    expect(ok).toBe(true);
    expect(hook).toHaveBeenCalledOnce();
    expect(hook.mock.calls[0][0][0].link).toBe(1_700_000_000_000);
  });

  it("fires when link changes from hash to arb", async () => {
    const prev = {
      user_id: "u1",
      order_id: "o1",
      player_id: 7,
      link: 12345,
      provider: "OB",
    };
    queryMock
      .mockResolvedValueOnce({ rows: [prev] })
      .mockResolvedValueOnce({ rowCount: 1 });
    const hook = vi.fn();
    setOrdersBoundHook(hook);

    const ok = await updateOrderBind("o1", "u1", 1_700_000_000_000, { provider: "OB" });

    expect(ok).toBe(true);
    expect(hook).toHaveBeenCalledOnce();
    expect(hook.mock.calls[0][0][0].link).toBe(1_700_000_000_000);
  });

  it("does not fire when new link remains hash", async () => {
    const prev = { user_id: "u1", order_id: "o1", link: 12345, provider: "OB" };
    queryMock
      .mockResolvedValueOnce({ rows: [prev] })
      .mockResolvedValueOnce({ rowCount: 1 });
    const hook = vi.fn();
    setOrdersBoundHook(hook);

    await updateOrderBind("o1", "u1", 99999, { provider: "OB" });

    expect(hook).not.toHaveBeenCalled();
  });

  it("does not fire when previous link was already arb", async () => {
    const prev = {
      user_id: "u1",
      order_id: "o1",
      link: 1_700_000_000_001,
      create_at: 1_781_890_412_000,
      provider: "OB",
    };
    queryMock
      .mockResolvedValueOnce({ rows: [prev] })
      .mockResolvedValueOnce({ rowCount: 1 });
    const hook = vi.fn();
    setOrdersBoundHook(hook);

    await updateOrderBind("o1", "u1", 1_700_000_000_002, { provider: "OB" });

    expect(hook).not.toHaveBeenCalled();
  });

  it("UPDATE uses $1 for link and $2+ for WHERE (no placeholder clash)", async () => {
    const prev = {
      user_id: "u1",
      order_id: "o1",
      link: 12345,
      provider: "OB",
    };
    queryMock
      .mockResolvedValueOnce({ rows: [prev] })
      .mockResolvedValueOnce({ rowCount: 1 });

    await updateOrderBind("o1", "u1", 1_700_000_000_000, { provider: "OB" });

    const updateCall = queryMock.mock.calls.find(([sql]) => String(sql).startsWith("UPDATE"));
    expect(updateCall).toBeDefined();
    const [sql, params] = updateCall;
    expect(sql).toBe(
      "UPDATE orders SET link = $1 WHERE user_id = $2 AND order_id = $3 AND provider = $4",
    );
    expect(params).toEqual([1_700_000_000_000, "u1", "o1", "OB"]);
  });

  it("returns false when order row is missing", async () => {
    queryMock.mockResolvedValueOnce({ rows: [] });
    const hook = vi.fn();
    setOrdersBoundHook(hook);

    const ok = await updateOrderBind("missing", "u1", 1_700_000_000_000);

    expect(ok).toBe(false);
    expect(hook).not.toHaveBeenCalled();
  });
});
