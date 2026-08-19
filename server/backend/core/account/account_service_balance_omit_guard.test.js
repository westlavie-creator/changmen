import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../esport-api/store.js", () => ({
  default: {
    getAccountsForUser: vi.fn(() => [
      { accountId: 47, provider: "Polymarket", balance: 512.25 },
    ]),
    removeAccountForUser: vi.fn(),
    setAccountsForUser: vi.fn(async () => {}),
  },
}));

vi.mock("./player_ownership.js", () => ({
  assertPlayerOwnedByUser: vi.fn(async () => ({
    ok: true,
    player: {
      id: 47,
      platformName: "Polymarket",
      provider: "Polymarket",
      totalBalance: 512.25,
    },
  })),
  assertPlayersOwnedByUser: vi.fn(async () => ({
    ok: true,
    players: [{
      id: 47,
      platformName: "Polymarket",
      provider: "Polymarket",
      totalBalance: 512.25,
    }],
  })),
  isPredictFunPlayerRow: (player) => {
    const p = String(player?.provider ?? "").toLowerCase();
    return p === "predictfun";
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
  updatePlayerBalance: vi.fn(async () => ({ total: 1, platformId: 1, platformName: "Polymarket" })),
  debitPlayerBalance: vi.fn(),
  creditPlayerBalance: vi.fn(),
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
  prepareAccountsForSave: vi.fn(async () => [{ accountId: 47 }]),
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

describe("SaveAccounts omit-balance guard (PM vault / non-PF)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("handleSaveAccounts keeps Polymarket total_balance when client omits balance", async () => {
    const store = (await import("../esport-api/store.js")).default;
    const { handleSaveAccounts } = await import("./account_service.js");

    // 对齐 vault gate / toJSON：balance 省略（undefined 经 JSON 丢掉）
    const saved = await handleSaveAccounts([
      {
        accountId: 47,
        provider: "Polymarket",
        platformName: "Polymarket",
        playerName: "pm1",
        token: "{\"walletAddress\":\"0xabc\"}",
      },
    ], "u1");

    expect(saved.ok).toBe(true);
    const payload = store.setAccountsForUser.mock.calls.at(-1)[1];
    expect(payload[0].provider).toBe("Polymarket");
    expect(payload[0].balance).toBe(512.25);
  });

  it("handleSaveAccounts still accepts explicit Polymarket balance 0", async () => {
    const store = (await import("../esport-api/store.js")).default;
    const { handleSaveAccounts } = await import("./account_service.js");

    const saved = await handleSaveAccounts([
      {
        accountId: 47,
        provider: "Polymarket",
        platformName: "Polymarket",
        playerName: "pm1",
        balance: 0,
      },
    ], "u1");

    expect(saved.ok).toBe(true);
    const payload = store.setAccountsForUser.mock.calls.at(-1)[1];
    expect(payload[0].balance).toBe(0);
  });
});
