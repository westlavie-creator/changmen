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
const getBalance = vi.hoisted(() => vi.fn());

vi.mock("@/api/vt", () => ({
  updateBalance,
}));

vi.mock("@/api/account", () => ({
  refreshPfBalance,
  refreshPmBalance: vi.fn(),
}));

vi.mock("@/runtime/venueAdapters", () => ({
  getAdapter: () => ({
    provider: { getBalance },
  }),
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
    getBalance.mockReset();
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

describe("refreshAccountBalance keep last good", () => {
  beforeEach(() => {
    updateBalance.mockClear();
    getBalance.mockReset();
  });

  it("keeps previous balance and marks stale on transient failure", async () => {
    getBalance.mockRejectedValue(new Error("network reset"));
    const { refreshAccountBalance } = await import("./balanceRefresh");
    const acc = new PlatformAccount({
      accountId: 7,
      playerName: "ob",
      provider: "OB",
      gateway: "https://ob.example",
      token: "tok",
    });
    acc.balance = 55;

    await refreshAccountBalance({} as never, acc);
    expect(acc.balance).toBe(55);
    expect(acc.balanceStale).toBe(true);
  });

  it("clears balance on auth failure even if previous balance exists", async () => {
    getBalance.mockRejectedValue(new Error("redis: nil"));
    const { refreshAccountBalance } = await import("./balanceRefresh");
    const acc = new PlatformAccount({
      accountId: 9,
      playerName: "ob",
      provider: "OB",
      gateway: "https://ob.example",
      token: "tok",
    });
    acc.balance = 55;

    await refreshAccountBalance({} as never, acc);
    expect(acc.balance).toBeUndefined();
    expect(acc.balanceStale).toBe(false);
    expect(acc.errorCount).toBe(1);
  });

  it("leaves balance undefined when never loaded and refresh fails", async () => {
    getBalance.mockResolvedValue(undefined);
    const { refreshAccountBalance } = await import("./balanceRefresh");
    const acc = new PlatformAccount({
      accountId: 8,
      playerName: "ob",
      provider: "OB",
      gateway: "https://ob.example",
      token: "tok",
    });
    expect(acc.balance).toBeUndefined();

    await refreshAccountBalance({} as never, acc);
    expect(acc.balance).toBeUndefined();
    expect(acc.balanceStale).toBe(false);
  });

  it("clears stale flag after successful refresh", async () => {
    getBalance.mockResolvedValue({ balance: 66, currency: "CNY" });
    const { refreshAccountBalance } = await import("./balanceRefresh");
    const acc = new PlatformAccount({
      accountId: 10,
      playerName: "ob",
      provider: "OB",
      gateway: "https://ob.example",
      token: "tok",
    });
    acc.balance = 55;
    acc.balanceStale = true;

    await refreshAccountBalance({} as never, acc);
    expect(acc.balance).toBe(66);
    expect(acc.balanceStale).toBe(false);
  });
});

describe("isVenueAuthFailureMessage", () => {
  it("detects OB redis nil and PB session codes", async () => {
    const { isVenueAuthFailureMessage } = await import("./balanceRefresh");
    expect(isVenueAuthFailureMessage("redis: nil")).toBe(true);
    expect(isVenueAuthFailureMessage("MULTIPLE_LOGIN")).toBe(true);
    expect(isVenueAuthFailureMessage("SESSION")).toBe(true);
    expect(isVenueAuthFailureMessage("token error")).toBe(true);
    expect(isVenueAuthFailureMessage("network reset")).toBe(false);
    // 勿把 HTTP 正文里的 Forbidden 误判成鉴权失效
    expect(isVenueAuthFailureMessage("Request failed with status code 403 Forbidden")).toBe(false);
  });
});
