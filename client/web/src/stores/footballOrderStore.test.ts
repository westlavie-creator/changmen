import { createPinia, setActivePinia } from "pinia";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const getFootballOrders = vi.hoisted(() => vi.fn());
const getOpenFootballOrders = vi.hoisted(() => vi.fn());
const saveObFootballOrder = vi.hoisted(() => vi.fn());
const fetchObSportAccountOrderPatches = vi.hoisted(() => vi.fn());
const waitObSportVenueOrderHydration = vi.hoisted(() => vi.fn());
const accounts = vi.hoisted(() => [{ accountId: 171, provider: "OB", playerName: "OB体育1" }]);

vi.mock("@/api/footballOrder", () => ({
  getFootballOrders,
  getOpenFootballOrders,
  patchFootballOrderStatus: vi.fn(),
  saveObFootballOrder,
}));

vi.mock("@/api/order", () => ({ saveOrders: vi.fn() }));

vi.mock("@/runtime/obSportBetRecord", () => ({
  fetchObSportAccountOrderPatches,
  fetchObSportPendingOrderPatches: vi.fn(async () => []),
  waitObSportVenueOrderHydration,
}));

vi.mock("@/runtime/obSportBetAccount", () => ({
  pickObSportBetAccount: vi.fn(() => null),
}));

vi.mock("@/runtime/podBetSettings", () => ({
  readPodBetSettings: vi.fn(() => ({ followAccountIds: [], followAccountId: 0 })),
}));

vi.mock("@/stores/accountStore", () => ({
  useAccountStore: () => ({
    accounts,
    findAccount: (id: number) => accounts.find(row => row.accountId === id) || null,
  }),
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
  status: "None" as const,
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
    saveObFootballOrder.mockReset().mockImplementation(async row => row);
    fetchObSportAccountOrderPatches.mockReset().mockResolvedValue([]);
    waitObSportVenueOrderHydration.mockReset().mockResolvedValue([]);
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

  it("upserts an OB venue order that was missing from the local football order list", async () => {
    getFootballOrders.mockResolvedValue([]);
    getOpenFootballOrders.mockResolvedValue([]);
    fetchObSportAccountOrderPatches.mockResolvedValue([{
      orderId: "venue-only-1",
      status: "Win",
      profit: 18,
      at: Date.parse("2026-09-22T06:00:00+08:00"),
      home: "Alpha",
      away: "Beta",
      sideLabel: "主胜",
      marketLabel: "独赢",
      odds: 1.88,
      stake: 100,
    }]);

    const store = useFootballOrderStore();
    await store.load("2026-09-22");
    await store.syncVenueAccountOrders(171);

    expect(saveObFootballOrder).toHaveBeenCalledWith(expect.objectContaining({
      id: "venue:OB:venue-only-1",
      orderId: "venue-only-1",
      playerId: 171,
      accountName: "OB体育1",
    }));
    expect(store.rows).toEqual([expect.objectContaining({ orderId: "venue-only-1", status: "Win" })]);
  });

  it("persists the placed placeholder before waiting for venue hydration", async () => {
    let resolveHydration: (value: never[]) => void = () => {};
    waitObSportVenueOrderHydration.mockReturnValue(new Promise((resolve) => {
      resolveHydration = resolve;
    }));

    const store = useFootballOrderStore();
    const saved = await store.appendPlaced(order, accounts[0]);

    expect(saved.orderId).toBe(order.orderId);
    expect(saveObFootballOrder).toHaveBeenCalledWith(expect.objectContaining({ orderId: order.orderId }));
    expect(waitObSportVenueOrderHydration).toHaveBeenCalled();
    resolveHydration([]);
    await Promise.resolve();
  });

  it("retries a failed placeholder save on the next account order refresh", async () => {
    saveObFootballOrder
      .mockRejectedValueOnce(new Error("temporary save failure"))
      .mockImplementationOnce(async row => row);

    const store = useFootballOrderStore();
    await store.appendPlaced(order, accounts[0]);
    expect(store.persistError).toBe("temporary save failure");

    await store.syncVenueAccountOrders(171);

    expect(saveObFootballOrder).toHaveBeenCalledTimes(2);
    expect(store.persistError).toBe("");
  });
});
