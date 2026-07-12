import { describe, expect, test, vi, beforeEach } from "vitest";

vi.mock("./clob_proxy.js", () => ({
  executePolymarketHttpRequest: vi.fn(async ({ url, method }) => ({
    status: 200,
    text: method === "GET" && String(url).includes("/book")
      ? JSON.stringify({ tick_size: "0.01", asks: [] })
      : method === "GET" && String(url).includes("/data/orders")
        ? JSON.stringify([{ id: "sell-1", asset_id: "123", side: "SELL", status: "ORDER_STATUS_LIVE" }])
        : method === "POST" && String(url).includes("/heartbeats")
          ? JSON.stringify({ heartbeat_id: "hb-next" })
          : JSON.stringify({ success: true, orderID: "oid-1" }),
  })),
}));

vi.mock("./clob_l2.js", () => ({
  fetchPolymarketTradesSince: vi.fn(async () => [{ taker_order_id: "t1", side: "BUY" }]),
}));

vi.mock("../../db/store.js", () => ({
  refreshAccountsFromRdsIfEmpty: vi.fn(async () => {}),
}));

vi.mock("../../esport-api/store.js", () => ({
  default: {
    getAccountsForUser: () => [{
      accountId: 47,
      provider: "polymarket",
      token: JSON.stringify({
        walletAddress: "0xabc",
        apiCreds: { apiKey: "k", secret: "c2VjcmV0", passphrase: "p" },
      }),
    }],
  },
}));

vi.mock("../../account/player_ownership.js", () => ({
  assertPlayerOwnedByUser: vi.fn(async () => ({ ok: true })),
}));

const {
  handlePmGetBook,
  handlePmSubmitOrder,
  handlePmGetTrades,
  handlePmHeartbeat,
  handlePmGetOpenOrders,
} = await import("./pm_client_handlers.js");

describe("pm_client_handlers", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  test("Pm_GetBook 公开盘口", async () => {
    const res = await handlePmGetBook({ tokenId: "123" }, "user-1");
    expect(res.ok).toBe(true);
    expect(res.info).toMatchObject({ tick_size: "0.01" });
  });

  test("Pm_SubmitOrder 需要 order", async () => {
    const res = await handlePmSubmitOrder({ playerId: 47 }, "user-1");
    expect(res.ok).toBe(false);
  });

  test("Pm_SubmitOrder 成功", async () => {
    const res = await handlePmSubmitOrder({
      playerId: 47,
      order: { foo: 1 },
    }, "user-1");
    expect(res.ok).toBe(true);
    expect(res.info).toMatchObject({ success: true, orderID: "oid-1" });
  });

  test("Pm_GetTrades 返回数组", async () => {
    const res = await handlePmGetTrades({ playerId: 47, after: 1700000000 }, "user-1");
    expect(res.ok).toBe(true);
    expect(Array.isArray(res.info)).toBe(true);
  });

  test("Pm_Heartbeat 返回 heartbeat_id", async () => {
    const res = await handlePmHeartbeat({ playerId: 47, heartbeatId: "" }, "user-1");
    expect(res.ok).toBe(true);
    expect(res.info).toMatchObject({ heartbeat_id: "hb-next" });
  });

  test("Pm_GetOpenOrders 返回列表", async () => {
    const res = await handlePmGetOpenOrders({ playerId: 47, assetId: "123" }, "user-1");
    expect(res.ok).toBe(true);
    expect(Array.isArray(res.info)).toBe(true);
  });
});
