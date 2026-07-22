import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../esport-api/store.js", () => ({
  default: {
    getAccountsForUser: vi.fn(() => [
      { accountId: 42, provider: "OB" }, // 故意写错，守卫应看 players
    ]),
    removeAccountForUser: vi.fn(),
    setAccountsForUser: vi.fn(async () => {}),
  },
}));

vi.mock("./player_ownership.js", () => ({
  assertPlayerOwnedByUser: vi.fn(async () => ({
    ok: true,
    player: {
      id: 42,
      platformName: "PredictFun",
      provider: "PredictFun",
      totalBalance: 100,
    },
  })),
  assertPlayersOwnedByUser: vi.fn(async () => ({
    ok: true,
    players: [{
      id: 42,
      platformName: "PredictFun",
      provider: "PredictFun",
      totalBalance: 100,
    }],
  })),
  isPredictFunPlayerRow: (player) => {
    const p = String(player?.provider ?? "").toLowerCase();
    if (p === "predictfun")
      return true;
    const n = String(player?.platformName ?? "").toLowerCase();
    return n.includes("predict");
  },
}));

vi.mock("./order_store.js", () => ({
  saveOrder: vi.fn(async () => true),
  listByPlayer: vi.fn(async () => []),
  scrubClientOrder: (o) => o,
  parseOrderBindRow: vi.fn(),
  saveOrderBind: vi.fn(),
  rebindOrderLink: vi.fn(),
  listByDatePage: vi.fn(),
  listUserProfitRank: vi.fn(),
}));

vi.mock("./account_store.js", () => ({
  updatePlayerBalance: vi.fn(async () => ({ total: 1, platformId: 1, platformName: "PredictFun" })),
  debitPlayerBalance: vi.fn(async () => ({ total: 90 })),
  creditPlayerBalance: vi.fn(async () => ({ total: 110 })),
  getPlayer: vi.fn(),
  listMoneyLogs: vi.fn(),
  getMoneyLog: vi.fn(),
  saveMoneyLog: vi.fn(),
  deleteMoneyLog: vi.fn(),
  deletePlayer: vi.fn(),
  deletePlayerData: vi.fn(),
  createTagPlatform: vi.fn(),
  listTagPlatforms: vi.fn(),
  saveUserLog: vi.fn(),
  prunePlayersNotInList: vi.fn(),
}));

vi.mock("../db/store.js", () => ({
  listProfileRows: vi.fn(() => []),
  loadAccountsForUser: vi.fn(),
  prepareAccountsForSave: vi.fn(async () => [{ accountId: 42 }]),
}));

vi.mock("@changmen/shared/account_multiply", () => ({
  normalizeAccountMultiplyField: (v) => v,
  preserveStoredAccountMultiply: (a) => ({ ...a }),
}));

vi.mock("@changmen/db/venue_account_key.js", () => ({
  VenueAccountKeyConflictError: class extends Error {},
  isVenueAccountKeyUniqueViolation: () => false,
}));

vi.mock("../integrations/polymarket/balance.js", () => ({
  fetchPolymarketCollateralBalance: vi.fn(),
}));

vi.mock("../integrations/polymarket/clob_proxy.js", () => ({
  executePolymarketHttpRequest: vi.fn(),
  pickPolymarketPolyHeaders: vi.fn(),
}));

vi.mock("../esport-api/stubs.js", () => ({
  emptyPage: () => ({ list: [], total: 0 }),
}));

vi.mock("../esport-api/user_kv.js", () => ({
  emptyDirectValue: () => null,
  isArrayKey: () => false,
  wrapObjectDirect: (v) => v,
}));

vi.mock("./balance_provider.js", () => ({
  enrichAccountFromPlatformDefaults: (a) => a,
  getAccountBalance: vi.fn(),
}));

vi.mock("./user_presence.js", () => ({
  resolvePresenceState: () => ({}),
}));

describe("PredictFun client write guard", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("isPredictFunClientSaveOrderRequest uses players identity even if ACCOUNT.provider forged", async () => {
    const { isPredictFunClientSaveOrderRequest } = await import("./account_service.js");
    expect(isPredictFunClientSaveOrderRequest(
      { type: "OB" },
      [{ provider: "OB" }],
      { id: 42, provider: "PredictFun", platformName: "PredictFun" },
    )).toBe(true);
    expect(isPredictFunClientSaveOrderRequest(
      { type: "OB" },
      [{ provider: "OB" }],
      { id: 7, provider: "OB", platformName: "OB" },
    )).toBe(false);
  });

  it("handleSaveOrder rejects PredictFun writes", async () => {
    const { handleSaveOrder } = await import("./account_service.js");
    const orderStore = await import("./order_store.js");

    const rejected = await handleSaveOrder({
      playerId: 42,
      type: "PredictFun",
      orders: JSON.stringify([{ orderId: "x", provider: "PredictFun", pfHoldShares: 999 }]),
    }, "u1");

    expect(rejected.ok).toBe(false);
    expect(String(rejected.msg)).toMatch(/禁止 Client_SaveOrder/);
    expect(orderStore.saveOrder).not.toHaveBeenCalled();
  });

  it("handleUpdateBalance rejects PredictFun even if ACCOUNT.provider was forged", async () => {
    const { handleUpdateBalance } = await import("./account_service.js");
    const accountStore = await import("./account_store.js");

    const rejected = await handleUpdateBalance({
      playerId: 42,
      balance: 99999,
    }, "u1");

    expect(rejected.ok).toBe(false);
    expect(String(rejected.msg)).toMatch(/禁止 Client_UpdateBalance/);
    expect(accountStore.updatePlayerBalance).not.toHaveBeenCalled();
  });
});
