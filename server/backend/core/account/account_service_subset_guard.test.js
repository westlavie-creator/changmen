import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../esport-api/store.js", () => ({
  default: {
    getAccountsForUser: vi.fn(() => [
      { accountId: 1, provider: "OB" },
      { accountId: 2, provider: "OB" },
    ]),
    removeAccountForUser: vi.fn(),
    setAccountsForUser: vi.fn(async () => {}),
  },
}));

vi.mock("./player_ownership.js", () => ({
  assertPlayerOwnedByUser: vi.fn(async () => ({ ok: true, player: { id: 1 } })),
  assertPlayersOwnedByUser: vi.fn(async (playerIds) => ({
    ok: true,
    players: (playerIds || []).map(id => ({ id: Number(id), provider: "OB", platformName: "OB" })),
  })),
  isPredictFunPlayerRow: () => false,
}));

vi.mock("./order_store.js", () => ({
  saveOrder: vi.fn(async () => true),
  listByPlayer: vi.fn(async () => []),
  scrubClientOrder: o => o,
  parseOrderBindRow: vi.fn(),
  saveOrderBind: vi.fn(),
  rebindOrderLink: vi.fn(),
  listByDatePage: vi.fn(),
  listUserProfitRank: vi.fn(),
}));

vi.mock("./account_store.js", () => ({
  updatePlayerBalance: vi.fn(),
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
  prunePlayersNotInList: vi.fn(async () => 0),
}));

vi.mock("../db/store.js", () => ({
  listProfileRows: vi.fn(() => []),
  loadAccountsForUser: vi.fn(async () => [
    { accountId: 1, provider: "OB" },
    { accountId: 2, provider: "OB" },
  ]),
  prepareAccountsForSave: vi.fn(async () => [
    { accountId: 1, provider: "OB" },
    { accountId: 2, provider: "OB" },
  ]),
}));

vi.mock("@changmen/shared/account_multiply", () => ({
  normalizeAccountMultiplyField: v => v,
  preserveStoredAccountMultiply: a => ({ ...a }),
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
  wrapObjectDirect: v => v,
}));

vi.mock("./balance_provider.js", () => ({
  enrichAccountFromPlatformDefaults: a => a,
  getAccountBalance: vi.fn(),
}));

vi.mock("./user_presence.js", () => ({
  resolvePresenceState: () => ({}),
}));

vi.mock("./pm_token_strip.js", () => ({
  enforcePolymarketPersistDto: () => ({ ok: true }),
  stripPrivateKeysFromAccountList: list => list,
}));

describe("handleSaveAccounts dual-tab subset guard", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("rejects stale subset that would drop an active player (no prune)", async () => {
    const store = (await import("../esport-api/store.js")).default;
    const accountStore = await import("./account_store.js");
    const { handleSaveAccounts } = await import("./account_service.js");

    const out = await handleSaveAccounts([
      { accountId: 1, provider: "OB", playerName: "a" },
    ], "u1");

    expect(out.ok).toBe(false);
    expect(String(out.msg)).toMatch(/多标签页|缺少已有账号/);
    expect(store.setAccountsForUser).not.toHaveBeenCalled();
    expect(accountStore.prunePlayersNotInList).not.toHaveBeenCalled();
  });

  it("accepts full list and does not prune after save", async () => {
    const store = (await import("../esport-api/store.js")).default;
    const accountStore = await import("./account_store.js");
    const { handleSaveAccounts } = await import("./account_service.js");

    const out = await handleSaveAccounts([
      { accountId: 1, provider: "OB", playerName: "a" },
      { accountId: 2, provider: "OB", playerName: "b" },
    ], "u1");

    expect(out.ok).toBe(true);
    expect(store.setAccountsForUser).toHaveBeenCalled();
    expect(accountStore.prunePlayersNotInList).not.toHaveBeenCalled();
  });

  it("still rejects empty overwrite when RDS/cache has accounts", async () => {
    const accountStore = await import("./account_store.js");
    const { handleSaveAccounts } = await import("./account_service.js");
    const out = await handleSaveAccounts([], "u1");
    expect(out.ok).toBe(false);
    expect(String(out.msg)).toMatch(/空列表/);
    expect(accountStore.prunePlayersNotInList).not.toHaveBeenCalled();
  });
});
