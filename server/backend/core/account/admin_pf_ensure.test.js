import { beforeEach, describe, expect, it, vi } from "vitest";

const loadAccountsForUserStrict = vi.fn();
const loadProfileById = vi.fn();
const listProfileRows = vi.fn(() => []);
const getAccountsForUser = vi.fn(() => []);
const setAccountsForUser = vi.fn(async () => {});
const createTagPlatform = vi.fn();
const isAdminUser = vi.fn(() => true);

vi.mock("@changmen/db", () => ({
  ensurePgPoolReady: vi.fn(),
  getPgPool: vi.fn(),
  fetchProfilesAdmin: vi.fn(async () => []),
}));

vi.mock("../auth/admin_auth.js", () => ({ isAdminUser }));
vi.mock("../auth/role_filter.js", () => ({
  getVisibleUserIds: vi.fn(async () => null),
  filterProfiles: p => p,
  resolveVisibleUserIds: () => null,
}));
vi.mock("../db/store.js", () => ({
  loadAccountsForUser: vi.fn(),
  loadAccountsForUserStrict,
  loadProfileById,
  listProfileRows,
}));
vi.mock("../esport-api/store.js", () => ({
  default: {
    getAccountsForUser,
    setAccountsForUser,
    updateAccountForUser: vi.fn(),
  },
}));
vi.mock("./account_store.js", () => ({
  createTagPlatform,
  getPlayer: vi.fn(),
  listMoneyLogs: vi.fn(),
  rechargePlayerBalanceWithMoneyLog: vi.fn(),
}));
vi.mock("../integrations/predictfun/pf_ledger.js", () => ({
  summarizePfOrders: () => ({ settledPnl: 0 }),
}));
vi.mock("./order_store.js", () => ({
  listByPlayer: vi.fn(async () => []),
}));
vi.mock("./admin_account_sanitize.js", () => ({
  sanitizeAccountForAdmin: a => a,
}));

describe("ensurePredictFunHouseAccount P0-4 D3", () => {
  const caller = { id: "admin", userName: "ops", is_admin: true };

  beforeEach(() => {
    vi.clearAllMocks();
    isAdminUser.mockReturnValue(true);
    listProfileRows.mockReturnValue([{ id: "u-pf", user_name: "alice" }]);
    loadProfileById.mockResolvedValue({ id: "u-pf", user_name: "alice" });
    getAccountsForUser.mockReturnValue([]);
  });

  it("RDS 读失败：抛错中止，不 CreateTagPlatform", async () => {
    loadAccountsForUserStrict.mockRejectedValueOnce(new Error("rds down"));
    const { ensurePredictFunHouseAccount } = await import("./admin_pf.js");
    await expect(ensurePredictFunHouseAccount("u-pf", caller))
      .rejects
      .toThrow(/账号读取失败/);
    expect(createTagPlatform).not.toHaveBeenCalled();
    expect(setAccountsForUser).not.toHaveBeenCalled();
  });

  it("已有 PF：不新建，created=false", async () => {
    loadAccountsForUserStrict.mockResolvedValueOnce([
      { accountId: 7, provider: "PredictFun", token: JSON.stringify({ mode: "house" }), playerName: "alice" },
    ]);
    getAccountsForUser.mockReturnValue([
      { accountId: 7, provider: "PredictFun", token: JSON.stringify({ mode: "house" }), playerName: "alice" },
    ]);
    const { ensurePredictFunHouseAccount } = await import("./admin_pf.js");
    const out = await ensurePredictFunHouseAccount("u-pf", caller);
    expect(out.created).toBe(false);
    expect(out.account.accountId).toBe(7);
    expect(createTagPlatform).not.toHaveBeenCalled();
  });

  it("无 PF 且读成功：CreateTagPlatform 并返回 created=true", async () => {
    loadAccountsForUserStrict.mockResolvedValueOnce([]);
    getAccountsForUser.mockReturnValue([]);
    createTagPlatform.mockResolvedValueOnce({
      playerId: 99,
      platformId: 1,
      playerName: "alice",
    });
    const { ensurePredictFunHouseAccount } = await import("./admin_pf.js");
    const out = await ensurePredictFunHouseAccount("u-pf", caller);
    expect(createTagPlatform).toHaveBeenCalledWith(
      "PredictFun",
      "alice",
      "u-pf",
      { provider: "PredictFun" },
    );
    expect(out.created).toBe(true);
    expect(out.account.accountId).toBe(99);
    expect(setAccountsForUser).toHaveBeenCalled();
  });
});
