import { describe, expect, it, vi, beforeEach } from "vitest";
import { SQL_ORDERS_VISIBLE } from "../order_link_filter.js";

const queryMock = vi.fn();

vi.mock("./common.js", () => ({
  getPgPool: () => ({ query: queryMock }),
  _jsonb: (val, fallback) => JSON.stringify(val ?? fallback ?? null),
}));

import {
  fetchOrdersByDate,
  fetchOrdersByPlayerAll,
  setOrdersBoundHook,
  updateOrderBind,
} from "./orders_store.js";

describe("orders_store read SQL", () => {
  beforeEach(() => {
    queryMock.mockReset();
    setOrdersBoundHook(null);
  });

  it("fetchOrdersByDate applies SQL_ORDERS_VISIBLE", async () => {
    queryMock.mockResolvedValue({ rows: [] });
    await fetchOrdersByDate("2026-06-18", "user-1");
    expect(queryMock).toHaveBeenCalledOnce();
    const [sql] = queryMock.mock.calls[0];
    expect(sql).toContain(SQL_ORDERS_VISIBLE);
  });

  it("fetchOrdersByPlayerAll includes hash orders (no list filter)", async () => {
    queryMock.mockResolvedValue({ rows: [] });
    await fetchOrdersByPlayerAll(7, "user-1");
    const [sql] = queryMock.mock.calls[0];
    expect(sql).not.toContain(SQL_ORDERS_VISIBLE);
  });
});

describe("updateOrderBind bound hook", () => {
  beforeEach(() => {
    queryMock.mockReset();
    setOrdersBoundHook(null);
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
    const prev = { user_id: "u1", order_id: "o1", link: 1_700_000_000_001, provider: "OB" };
    queryMock
      .mockResolvedValueOnce({ rows: [prev] })
      .mockResolvedValueOnce({ rowCount: 1 });
    const hook = vi.fn();
    setOrdersBoundHook(hook);

    await updateOrderBind("o1", "u1", 1_700_000_000_002, { provider: "OB" });

    expect(hook).not.toHaveBeenCalled();
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
