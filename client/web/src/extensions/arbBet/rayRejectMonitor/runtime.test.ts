import type { VenueOrder } from "@changmen/venue-adapter/contract";
import { createPinia, setActivePinia } from "pinia";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { registerRayRejectMonitor, runRayRejectMonitorTick } from "./runtime";
import { useRayRejectMonitorStore } from "./store";

const { getOrders, saveUserLog, saveOrders, bindArbOrderId, refreshOrderListAfterBind, rayPrefs } = vi.hoisted(() => ({
  getOrders: vi.fn<() => Promise<VenueOrder[]>>(),
  saveUserLog: vi.fn(async () => true),
  saveOrders: vi.fn(async () => true),
  bindArbOrderId: vi.fn(async () => true),
  refreshOrderListAfterBind: vi.fn(),
  rayPrefs: { enabled: false, monitorMinutes: 5 },
}));

vi.mock("@/api/chat", () => ({ saveUserLog }));
vi.mock("@/api/order", () => ({ saveOrders }));
vi.mock("@/stores/betting/arbOrderBind", () => ({ bindArbOrderId, refreshOrderListAfterBind }));
vi.mock("@/stores/userStore", () => ({
  useUserStore: () => ({
    userId: "u1",
    extensionPrefs: { rayLateRejectAutoMakeup: rayPrefs },
  }),
}));
vi.mock("@/stores/accountStore", () => ({
  useAccountStore: () => ({
    findAccount: () => ({ accountId: 2, provider: "RAY", active: false }),
  }),
}));
vi.mock("@/runtime/providers", () => ({
  getProvider: () => ({ getOrders }),
}));

function venueOrder(status: VenueOrder["status"]): VenueOrder {
  return {
    provider: "RAY",
    orderId: "ray-1",
    odds: 2.06,
    createAt: 10_500,
    betMoney: 70,
    reward: 0,
    money: 0,
    status,
    game: "cs2",
    match: "Alpha -VS- Beta",
    bet: "[地图1] 获胜",
    item: "Beta",
  };
}

function register(initialOrders: VenueOrder[], initialRejected = false) {
  registerRayRejectMonitor({
    linkId: 100,
    matchId: 1,
    betId: 10,
    side: "B",
    accountId: 2,
    submittedAt: 10_000,
    match: "Alpha vs Beta",
    bet: "[地图1] 获胜",
    item: "Beta",
    target: "Away",
    odds: 2.06,
    betMoney: 70,
    anchorConfirmed: true,
    anchorProvider: "Polymarket",
    anchorAccountId: 1,
    anchorBetMoney: 10,
    anchorOdds: 2.2,
    initialOrders,
    initialRejected,
  });
}

describe("rAY reject shadow monitor", () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    vi.useFakeTimers();
    vi.setSystemTime(11_000);
    vi.clearAllMocks();
    sessionStorage.clear();
    rayPrefs.enabled = false;
    rayPrefs.monitorMinutes = 5;
  });

  it("detects a later reject without producing a makeup action", async () => {
    register([venueOrder("none")]);
    const store = useRayRejectMonitorStore();
    expect(store.taskForLink(100)?.status).toBe("watching");

    getOrders.mockResolvedValueOnce([venueOrder("reject")]);
    vi.setSystemTime(12_100);
    runRayRejectMonitorTick();
    await vi.waitFor(() => expect(store.taskForLink(100)?.status).toBe("rejected"));

    expect(store.taskForLink(100)?.rejectDelayMs).toBeGreaterThanOrEqual(1_600);
    expect(saveUserLog).toHaveBeenCalledWith(
      "RAY旁路监控 => 检测到延迟拒单",
      expect.objectContaining({
        linkId: 100,
        orderId: "ray-1",
        shadowOnly: true,
      }),
    );
    expect(saveOrders).toHaveBeenCalledWith(
      expect.objectContaining({ accountId: 2, provider: "RAY" }),
      [expect.objectContaining({ orderId: "ray-1", status: "reject", link: 100 })],
    );
    expect(refreshOrderListAfterBind).toHaveBeenCalledTimes(1);
  });

  it("persists and binds an order when it first appears", async () => {
    register([]);
    const store = useRayRejectMonitorStore();
    getOrders.mockResolvedValueOnce([venueOrder("none")]);
    vi.setSystemTime(12_100);

    runRayRejectMonitorTick();
    await vi.waitFor(() => expect(store.taskForLink(100)?.status).toBe("watching"));

    expect(saveOrders).toHaveBeenCalledWith(
      expect.objectContaining({ accountId: 2, provider: "RAY" }),
      [expect.objectContaining({ orderId: "ray-1", link: 100 })],
    );
    expect(bindArbOrderId).toHaveBeenCalledWith(100, "RAY", 2, "ray-1");
    expect(refreshOrderListAfterBind).toHaveBeenCalledTimes(1);
  });

  it("does not duplicate an immediate reject already handled by orchestration", () => {
    register([venueOrder("reject")], true);
    expect(useRayRejectMonitorStore().tasks.size).toBe(0);
  });

  it("uses the configured minutes from the RAY venue order createAt and removes on timeout", () => {
    rayPrefs.monitorMinutes = 2;
    register([venueOrder("none")]);
    const store = useRayRejectMonitorStore();
    expect(store.taskForLink(100)).toMatchObject({
      submittedAt: 10_500,
      monitorMinutes: 2,
      expiresAt: 130_500,
    });

    vi.setSystemTime(130_501);
    runRayRejectMonitorTick();

    expect(store.taskForLink(100)).toBeNull();
    expect(getOrders).not.toHaveBeenCalled();
    expect(saveUserLog).toHaveBeenCalledWith(
      "RAY旁路监控 => 观察超时",
      expect.objectContaining({ monitorEvent: "expired", linkId: 100 }),
    );
  });

  it.each(["win", "lose", "return"] as const)(
    "removes the monitor when the RAY venue order becomes %s",
    async (status) => {
      register([venueOrder("none")]);
      const store = useRayRejectMonitorStore();
      getOrders.mockResolvedValueOnce([venueOrder(status)]);
      vi.setSystemTime(12_100);

      runRayRejectMonitorTick();
      await vi.waitFor(() => expect(store.taskForLink(100)).toBeNull());
    },
  );
});
