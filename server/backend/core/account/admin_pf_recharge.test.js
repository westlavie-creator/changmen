import { beforeEach, describe, expect, it, vi } from "vitest";

const getAccountsForUser = vi.fn();
const isAdminUser = vi.fn(() => true);
const getVisibleUserIds = vi.fn(async () => null);

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
  loadAccountsForUser: vi.fn(),
  loadProfileById: vi.fn(),
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
  rechargePlayerBalanceWithMoneyLog: vi.fn(),
  getPlayer: vi.fn(),
  listMoneyLogs: vi.fn(),
}));
vi.mock("../integrations/predictfun/pf_player_account.js", () => ({
  publishPfBalanceKnown: vi.fn(),
}));
vi.mock("../integrations/predictfun/pf_ledger.js", () => ({
  summarizePfOrders: () => ({ settledPnl: 0 }),
}));
vi.mock("./order_store.js", () => ({
  listByPlayer: vi.fn(async () => []),
}));

describe("rechargeAdminPredictFunMember (会员下线)", () => {
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
  });

  it("rejects recharge with membership removed message", async () => {
    const { rechargeAdminPredictFunMember } = await import("./admin_service.js");
    const { PF_MEMBERSHIP_REMOVED_MSG } = await import("./admin_pf.js");
    await expect(
      rechargeAdminPredictFunMember(
        "u1",
        42,
        { amount: 150, description: "线下到账" },
        { id: "admin1", userName: "ops" },
      ),
    ).rejects.toThrow(PF_MEMBERSHIP_REMOVED_MSG);
  });

  it("updateAdminAccountFields still rejects PF balance patch", async () => {
    const { updateAdminAccountFields } = await import("./admin_service.js");
    await expect(
      updateAdminAccountFields("u1", 42, { balance: 999 }, { id: "a", userName: "ops" }),
    ).rejects.toThrow(/充值|会员|下线/);
  });
});
