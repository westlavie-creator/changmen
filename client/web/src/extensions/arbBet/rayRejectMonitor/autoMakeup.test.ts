import type { RayRejectMonitorTask } from "./types";
import { createPinia, setActivePinia } from "pinia";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { handleRayLateRejectAutoMakeup } from "./autoMakeup";
import { useRayRejectMonitorStore } from "./store";

const state = vi.hoisted(() => ({
  enabled: false,
  makeUp: true,
  orders: new Map<number, { linkId: number; target: "Home" | "Away" }>(),
  cancelledOrders: new Map<number, unknown>(),
  enqueue: vi.fn(async () => true),
  saveUserLog: vi.fn(async () => true),
}));

vi.mock("@/api/chat", () => ({ saveUserLog: state.saveUserLog }));
vi.mock("@/stores/userStore", () => ({
  useUserStore: () => ({
    extensionPrefs: { rayLateRejectAutoMakeup: { enabled: state.enabled } },
    config: { makeUp: state.makeUp },
  }),
}));
vi.mock("@/stores/loseOrderStore", () => ({
  useLoseOrderStore: () => ({
    orders: state.orders,
    cancelledOrders: state.cancelledOrders,
    ensureOrdersMap: vi.fn(),
  }),
}));
vi.mock("@/stores/matchStore", () => ({
  useMatchStore: () => ({
    matchs: [{ id: 1, title: "Alpha vs Beta", bets: [{ id: 10 }] }],
    setBettingMessage: vi.fn(),
  }),
}));
vi.mock("@/stores/betting/autoBet/makeUp", () => ({
  enqueueMakeUpOrder: state.enqueue,
}));

function task(overrides: Partial<RayRejectMonitorTask> = {}): RayRejectMonitorTask {
  return {
    key: "u1:100:B:2",
    userId: "u1",
    linkId: 100,
    matchId: 1,
    betId: 10,
    side: "B",
    accountId: 2,
    submittedAt: 10_000,
    expiresAt: 310_000,
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
    status: "rejected",
    boundOrderId: "ray-1",
    candidateCount: 1,
    pollCount: 2,
    nextPollAt: 12_000,
    rejectDelayMs: 2_000,
    updatedAt: 12_000,
    ...overrides,
  };
}

describe("rAY late-reject auto makeup bridge", () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    state.enabled = false;
    state.makeUp = true;
    state.orders.clear();
    state.cancelledOrders.clear();
    state.enqueue.mockReset().mockResolvedValue(true);
    state.saveUserLog.mockClear();
  });

  it("does nothing by default when the extension switch is off", async () => {
    const row = task();
    useRayRejectMonitorStore().upsert(row);

    await handleRayLateRejectAutoMakeup(row);

    expect(state.enqueue).not.toHaveBeenCalled();
    expect(useRayRejectMonitorStore().tasks.get(row.key)?.autoMakeupStatus).toBe("disabled");
  });

  it("passes the confirmed late reject to the existing makeup queue unchanged", async () => {
    state.enabled = true;
    const row = task();
    useRayRejectMonitorStore().upsert(row);

    await handleRayLateRejectAutoMakeup(row);

    expect(state.enqueue).toHaveBeenCalledOnce();
    expect(state.enqueue).toHaveBeenCalledWith(expect.objectContaining({
      linkId: 100,
      accountId: 1,
      target: "Away",
      betMoney: 10,
      betOdds: 2.2,
      failedLegOdds: 2.06,
    }));
    expect(useRayRejectMonitorStore().tasks.get(row.key)?.autoMakeupStatus).toBe("enqueued");
  });

  it("never overwrites an existing different makeup task", async () => {
    state.enabled = true;
    state.orders.set(10, { linkId: 999, target: "Home" });
    const row = task();
    useRayRejectMonitorStore().upsert(row);

    await handleRayLateRejectAutoMakeup(row);

    expect(state.enqueue).not.toHaveBeenCalled();
    expect(useRayRejectMonitorStore().tasks.get(row.key)?.autoMakeupStatus).toBe("skipped");
    expect(useRayRejectMonitorStore().tasks.get(row.key)?.autoMakeupReason).toContain("未覆盖");
  });
});
