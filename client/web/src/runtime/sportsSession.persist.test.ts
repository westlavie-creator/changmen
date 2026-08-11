import { beforeEach, describe, expect, it, vi } from "vitest";

const saveAccounts = vi.fn(async () => true);
const startBalanceRefreshLoop = vi.fn();
const loadAccounts = vi.fn(async () => {});
const loadTagPlatforms = vi.fn(async () => {});
const refreshAllFromVenues = vi.fn(async () => {});

vi.mock("@/stores/userStore", () => ({
  useUserStore: () => ({
    userId: "user-1",
    fetchUserInfo: vi.fn(async () => {}),
  }),
}));

vi.mock("@/stores/accountStore", () => ({
  useAccountStore: () => ({
    accounts: [],
    loadAccounts,
    loadTagPlatforms,
    startBalanceRefreshLoop,
    stopBalanceRefreshLoop: vi.fn(),
    saveAccounts,
  }),
}));

vi.mock("@/security/pmVault", () => ({
  ensurePmVaultUnlocked: vi.fn(async () => false),
  hasVault: vi.fn(async () => false),
  mergeVaultKeysIntoAccounts: vi.fn(),
  migrateTokenPrivateKeysToVault: vi.fn(async () => 0),
  normalizePmVaultUserId: (id: string) => id,
}));

vi.mock("@changmen/venue-adapter/polymarket", () => ({
  applyPmAutoTransportOnLogin: vi.fn(async () => {}),
}));

vi.mock("@changmen/venue-adapter/predictfun", () => ({
  applyPfAutoTransportOnLogin: vi.fn(async () => {}),
}));

vi.mock("@/stores/account/balanceRefresh", () => ({
  refreshAllFromVenues,
}));

vi.mock("@/stores/orderStore", () => ({
  useOrderStore: () => ({
    fetchOrders: vi.fn(async () => {}),
  }),
}));

describe("mountSportsSession ACCOUNT persist", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("refreshes balances without persistAccounts (dual-tab safe)", async () => {
    const { mountSportsSession } = await import("./sportsSession");
    await mountSportsSession();
    // post-unlock refresh is fire-and-forget
    await vi.waitFor(() => {
      expect(refreshAllFromVenues).toHaveBeenCalled();
    });
    expect(refreshAllFromVenues).toHaveBeenCalledWith(
      expect.anything(),
      true,
      { persistAccounts: false },
    );
    expect(saveAccounts).not.toHaveBeenCalled();
  });
});
