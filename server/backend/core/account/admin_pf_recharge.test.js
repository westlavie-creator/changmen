import { beforeEach, describe, expect, it, vi } from "vitest";

const rechargePlayerBalanceWithMoneyLog = vi.fn();
const getPlayer = vi.fn();
const listMoneyLogs = vi.fn();
const publishPfBalanceKnown = vi.fn();
const getAccountsForUser = vi.fn();
const loadAccountsForUser = vi.fn();
const loadProfileById = vi.fn();
const getVisibleUserIds = vi.fn(async () => null);
const isAdminUser = vi.fn(() => true);

vi.mock("@changmen/db", () => ({
  ensurePgPoolReady: vi.fn(),
  getPgPool: vi.fn(),
  insertProfile: vi.fn(),
  fetchProfilesAdmin: vi.fn(async () => []),
}));

vi.mock("../auth/admin_auth.js", () => ({ isAdminUser }));
vi.mock("../auth/role_filter.js", () => ({
  getVisibleUserIds,
  filterProfiles: (p) => p,
  resolveVisibleUserIds: () => null,
}));
vi.mock("../db/store.js", () => ({
  loadAccountsForUser,
  loadProfileById,
  listProfileRows: () => [],
}));
vi.mock("../esport-api/store.js", () => ({
  default: {
    getAccountsForUser,
    setAccountsForUser: vi.fn(),
    updateAccountForUser: vi.fn(),
  },
}));
vi.mock("./account_store.js", () => ({
  rechargePlayerBalanceWithMoneyLog,
  getPlayer,
  listMoneyLogs,
}));
vi.mock("../integrations/predictfun/pf_player_account.js", () => ({
  publishPfBalanceKnown,
}));
vi.mock("../integrations/predictfun/pf_ledger.js", () => ({
  summarizePfOrders: () => ({ settledPnl: 0 }),
}));
vi.mock("./order_store.js", () => ({
  listByPlayer: vi.fn(async () => []),
}));

describe("rechargeAdminPredictFunMember", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    isAdminUser.mockReturnValue(true);
    getVisibleUserIds.mockResolvedValue(null);
    getAccountsForUser.mockReturnValue([{
      accountId: 42,
      provider: "PredictFun",
      maxBalance: 0,
      balance: 100,
    }]);
    getPlayer.mockResolvedValue({ id: 42, ownerUserId: "u1", totalBalance: 100 });
    rechargePlayerBalanceWithMoneyLog.mockResolvedValue({
      ok: true,
      amount: 150,
      balanceBefore: 100,
      total: 250,
      log: {
        id: 9,
        player_id: 42,
        type: "Recharge",
        money: 150,
        currency: "USDT",
        description: "管理员充值 by ops：线下到账",
        create_at: 1,
      },
    });
    publishPfBalanceKnown.mockResolvedValue({
      ok: true,
      info: { accountId: 42, balance: 250, currency: "USDT" },
    });
  });

  it("credits delta and money log in one store call", async () => {
    const { rechargeAdminPredictFunMember } = await import("./admin_service.js");
    const out = await rechargeAdminPredictFunMember(
      "u1",
      42,
      { amount: 150, description: "线下到账" },
      { id: "admin1", userName: "ops" },
    );
    expect(rechargePlayerBalanceWithMoneyLog).toHaveBeenCalledWith(
      expect.objectContaining({
        playerId: 42,
        ownerUserId: "u1",
        amount: 150,
        currency: "USDT",
        description: expect.stringContaining("ops"),
      }),
    );
    expect(out.balanceBefore).toBe(100);
    expect(out.balance).toBe(250);
    expect(out.amount).toBe(150);
    expect(out.log.ID).toBe(9);
  });

  it("rejects direct zero/negative amount", async () => {
    const { rechargeAdminPredictFunMember } = await import("./admin_service.js");
    await expect(
      rechargeAdminPredictFunMember("u1", 42, { amount: 0 }, { id: "a", userName: "ops" }),
    ).rejects.toThrow(/大于 0/);
    expect(rechargePlayerBalanceWithMoneyLog).not.toHaveBeenCalled();
  });

  it("updateAdminAccountFields rejects PF balance patch", async () => {
    const { updateAdminAccountFields } = await import("./admin_service.js");
    await expect(
      updateAdminAccountFields("u1", 42, { balance: 999 }, { id: "a", userName: "ops" }),
    ).rejects.toThrow(/充值/);
  });
});
