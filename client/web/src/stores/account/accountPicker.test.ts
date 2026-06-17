import { describe, expect, it, vi, beforeEach } from "vitest";
import { BetOption } from "@/models/betOption";
import { PlatformAccount } from "@/models/platformAccount";
import type { AccountStoreContext } from "@/stores/account/context";
import { getProviders, pickAccount } from "@/stores/account/accountPicker";

vi.mock("@/stores/configStore", () => ({
  useConfigStore: () => ({
    config: { profit: 1.03, betMoney: 100 },
  }),
}));

function makeAccount(patch: Record<string, unknown> = {}) {
  const { balance, ...rest } = patch;
  const acc = new PlatformAccount({
    accountId: 1,
    playerName: "a",
    provider: "RAY",
    ...rest,
  });
  acc.balance = typeof balance === "number" ? balance : 1000;
  return acc;
}

function makeStore(accounts: PlatformAccount[]): AccountStoreContext {
  return {
    accounts,
    tagPlatforms: [],
    providerPickIndex: new Map(),
    balanceRefreshRunning: false,
    loading: false,
    loaded: true,
    editDialogOpen: false,
    editDialogAccount: undefined,
    findAccount: () => undefined,
    getPlatformName: (_, fallback = "") => fallback,
    saveAccounts: async () => true,
    loadTagPlatforms: async () => {},
    refreshAllFromVenues: async () => {},
  };
}

describe("getProviders", () => {
  it("groups accounts with balance at or above threshold", () => {
    const store = makeStore([
      makeAccount({ accountId: 1, provider: "RAY", balance: 200 }),
      makeAccount({ accountId: 2, provider: "RAY", balance: 50 }),
      makeAccount({ accountId: 3, provider: "OB", balance: 500 }),
    ]);
    const map = getProviders(store, 100);
    expect(map.get("RAY")?.map((a) => a.accountId)).toEqual([1]);
    expect(map.get("OB")?.map((a) => a.accountId)).toEqual([3]);
  });
});

describe("pickAccount", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns undefined when no candidate matches provider or balance", () => {
    const store = makeStore([makeAccount({ provider: "OB", balance: 10 })]);
    expect(pickAccount(store, "RAY", 100)).toBeUndefined();
  });

  it("rotates among multiple accounts on the same provider", () => {
    const store = makeStore([
      makeAccount({ accountId: 1, provider: "RAY" }),
      makeAccount({ accountId: 2, provider: "RAY" }),
    ]);
    const first = pickAccount(store, "RAY", 100);
    const second = pickAccount(store, "RAY", 100);
    expect(first?.accountId).toBe(1);
    expect(second?.accountId).toBe(2);
  });

  it("prefers lower account.profit threshold when implied meets both (A8)", () => {
    const store = makeStore([
      makeAccount({ accountId: 1, provider: "RAY", profit: 1.04 }),
      makeAccount({ accountId: 2, provider: "RAY", profit: 1.03 }),
    ]);
    const options = [
      { odds: 2.0, match: { game: "LOL" } },
      { odds: 2.0, match: { game: "LOL" } },
    ] as BetOption[];
    const picked = pickAccount(store, "RAY", 100, [], undefined, options);
    expect(picked?.accountId).toBe(2);
  });

  it("excludes accounts in excludeAccountIds", () => {
    const store = makeStore([
      makeAccount({ accountId: 1, provider: "RAY" }),
      makeAccount({ accountId: 2, provider: "RAY" }),
    ]);
    expect(pickAccount(store, "RAY", 100, [1])?.accountId).toBe(2);
  });
});
