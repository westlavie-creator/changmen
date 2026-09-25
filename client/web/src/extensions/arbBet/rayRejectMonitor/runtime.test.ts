import type { VenueOrder } from "@changmen/venue-adapter/contract";
import { createPinia, setActivePinia } from "pinia";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { registerRayRejectMonitor, runRayRejectMonitorTick } from "./runtime";
import { useRayRejectMonitorStore } from "./store";

const { getOrders, saveUserLog } = vi.hoisted(() => ({
  getOrders: vi.fn<() => Promise<VenueOrder[]>>(),
  saveUserLog: vi.fn(async () => true),
}));

vi.mock("@/api/chat", () => ({ saveUserLog }));
vi.mock("@/stores/userStore", () => ({
  useUserStore: () => ({
    userId: "u1",
    extensionPrefs: { rayLateRejectAutoMakeup: { enabled: false } },
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
  });

  it("detects a later reject without producing a makeup action", async () => {
    register([venueOrder("none")]);
    const store = useRayRejectMonitorStore();
    expect(store.taskForLink(100)?.status).toBe("watching");

    getOrders.mockResolvedValueOnce([venueOrder("reject")]);
    vi.setSystemTime(12_100);
    runRayRejectMonitorTick();
    await vi.waitFor(() => expect(store.taskForLink(100)?.status).toBe("rejected"));

    expect(store.taskForLink(100)?.rejectDelayMs).toBeGreaterThanOrEqual(2_100);
    expect(saveUserLog).toHaveBeenCalledWith(
      "RAY旁路监控 => 检测到延迟拒单",
      expect.objectContaining({
        linkId: 100,
        orderId: "ray-1",
        shadowOnly: true,
      }),
    );
  });

  it("does not duplicate an immediate reject already handled by orchestration", () => {
    register([venueOrder("reject")], true);
    expect(useRayRejectMonitorStore().tasks.size).toBe(0);
  });
});
