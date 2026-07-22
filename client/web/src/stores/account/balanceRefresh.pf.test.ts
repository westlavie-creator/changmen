import { beforeEach, describe, expect, it, vi } from "vitest";
import { PlatformAccount } from "@/models/platformAccount";

const updateBalance = vi.hoisted(() => vi.fn(async () => ({ total: 100, platformId: 1, platformName: "PredictFun" })));
const refreshPfBalance = vi.hoisted(() => vi.fn(async () => ({
  balance: 88.5,
  currency: "USDT",
  totalProfit: 1.2,
  unsettle: 0,
  orderCount: 3,
})));

vi.mock("@/api/vt", () => ({
  updateBalance,
}));

vi.mock("@/api/account", () => ({
  refreshPfBalance,
  refreshPmBalance: vi.fn(),
}));

vi.mock("@/runtime/venueAdapters", () => ({
  getAdapter: () => null,
}));

vi.mock("@/stores/messageStore", () => ({
  useMessageStore: () => ({
    balanceMessage: vi.fn(),
    profitMessage: vi.fn(),
  }),
}));

describe("refreshAccountBalance PredictFun", () => {
  beforeEach(() => {
    updateBalance.mockClear();
    refreshPfBalance.mockClear();
  });

  it("reads RDS via Pf_RefreshBalance and never Client_UpdateBalance", async () => {
    const { refreshAccountBalance } = await import("./balanceRefresh");
    const acc = new PlatformAccount({
      accountId: 42,
      playerName: "pf",
      provider: "PredictFun",
    });

    await refreshAccountBalance({} as never, acc);

    expect(refreshPfBalance).toHaveBeenCalledWith(42);
    expect(acc.balance).toBe(88.5);
    expect(updateBalance).not.toHaveBeenCalled();
  });
});
