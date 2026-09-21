import { createPinia, setActivePinia } from "pinia";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const getFootballOrders = vi.hoisted(() => vi.fn());
const getOpenFootballOrders = vi.hoisted(() => vi.fn());

vi.mock("@/api/footballOrder", () => ({
  getFootballOrders,
  getOpenFootballOrders,
  patchFootballOrderStatus: vi.fn(),
  saveObFootballOrder: vi.fn(),
}));

vi.mock("@/api/order", () => ({ saveOrders: vi.fn() }));

vi.mock("@/runtime/obSportBetRecord", () => ({
  fetchObSportPendingOrderPatches: vi.fn(async () => []),
  waitObSportVenueOrderHydration: vi.fn(async () => []),
}));

vi.mock("@/runtime/obSportBetAccount", () => ({
  pickObSportBetAccount: vi.fn(() => null),
}));

vi.mock("@/runtime/podBetSettings", () => ({
  readPodBetSettings: vi.fn(() => ({ followAccountIds: [], followAccountId: 0 })),
}));

vi.mock("@/stores/accountStore", () => ({
  useAccountStore: () => ({ accounts: [], findAccount: () => null }),
}));

import { stopFootballOrderRuntime, useFootballOrderStore } from "@/stores/footballOrderStore";

const order = {
  id: "football-1",
  orderId: "5370081590601915",
  at: Date.parse("2026-09-22T05:00:00+08:00"),
  home: "Home",
  away: "Away",
  sideLabel: "Home",
  marketLabel: "Moneyline",
  odds: 2,
  stake: 100,
  oid: "",
  obMid: "match-1",
  auto: false,
  status: "None",
  profit: 0,
  venue: "OB",
  playerId: 171,
};

describe("football order loading compatibility", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    setActivePinia(createPinia());
    getFootballOrders.mockReset().mockResolvedValue([order]);
    getOpenFootballOrders.mockReset();
  });

  afterEach(() => {
    stopFootballOrderRuntime();
    vi.useRealTimers();
  });

  it("keeps the normal order list when an older backend rejects the open-order action", async () => {
    getOpenFootballOrders.mockRejectedValue(new Error("unknown action: Client_GetOpenFootballOrders"));

    const store = useFootballOrderStore();
    await store.load("2026-09-22");

    expect(store.rows).toHaveLength(1);
    expect(store.rows[0]?.orderId).toBe("5370081590601915");
    expect(store.settlementRows).toEqual([]);
    expect(store.loaded).toBe(true);
    expect(store.persistError).toBe("");
  });
});
