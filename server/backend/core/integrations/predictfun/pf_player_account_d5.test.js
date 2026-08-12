import { beforeEach, describe, expect, it, vi } from "vitest";

const fetchOrdersByPlayer = vi.hoisted(() => vi.fn(async () => []));
const fetchOrdersByPlayerStrict = vi.hoisted(() => vi.fn(async () => []));

vi.mock("@changmen/db", () => ({
  fetchOrdersByPlayer,
  fetchOrdersByPlayerStrict,
}));

vi.mock("../../account/account_store.js", () => ({
  updatePlayerBalance: vi.fn(),
  claimCreditPfPendingOrder: vi.fn(),
  getAccountsFromKv: vi.fn(() => []),
}));

vi.mock("../../esport-api/store.js", () => ({
  default: {
    getAccountsForUser: vi.fn(() => []),
    setAccountsForUser: vi.fn(async () => {}),
  },
}));

vi.mock("../../account/order_store.js", () => ({
  rowToOrder: (r) => ({
    OrderID: r.order_id,
    Status: r.status || "None",
    PlayerID: r.player_id,
  }),
}));

vi.mock("./pf_order_service.js", () => ({
  withHouseOrderLock: vi.fn(async fn => fn()),
}));

describe("loadPfOrdersStrict P0-4 D5", () => {
  beforeEach(() => {
    fetchOrdersByPlayer.mockReset();
    fetchOrdersByPlayerStrict.mockReset();
    fetchOrdersByPlayer.mockResolvedValue([]);
    fetchOrdersByPlayerStrict.mockResolvedValue([]);
  });

  it("strict: RDS 失败向上抛，不返回空列表", async () => {
    fetchOrdersByPlayerStrict.mockRejectedValueOnce(new Error("rds down"));
    const { loadPfOrdersStrict } = await import("./pf_player_account.js");
    await expect(loadPfOrdersStrict(1, "u1")).rejects.toThrow("rds down");
  });

  it("lenient loadPfOrders: 走 fetchOrdersByPlayer（失败由该层吞成 []）", async () => {
    fetchOrdersByPlayer.mockResolvedValueOnce([]);
    const { loadPfOrders } = await import("./pf_player_account.js");
    await expect(loadPfOrders(1, "u1")).resolves.toEqual([]);
    expect(fetchOrdersByPlayer).toHaveBeenCalled();
    expect(fetchOrdersByPlayerStrict).not.toHaveBeenCalled();
  });

  it("retryPendingPfLedgerCredits: 读失败中止，不静默跳过入账", async () => {
    fetchOrdersByPlayerStrict.mockRejectedValueOnce(new Error("rds down"));
    const { retryPendingPfLedgerCredits } = await import("./pf_player_account.js");
    await expect(retryPendingPfLedgerCredits(1, "u1")).rejects.toThrow("rds down");
  });
});
