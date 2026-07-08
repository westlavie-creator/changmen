import { createPinia, setActivePinia } from "pinia";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { LoseOrder } from "@/models/loseOrder";
import { useActiveBetRunStore } from "@/stores/activeBetRunStore";
import { syncActiveBetBegin, syncActiveBetAfterRejectSync, syncActiveBetPlaceResults } from "@/stores/betting/activeBetRunSync";

vi.mock("@/stores/accountStore", () => ({
  useAccountStore: () => ({
    findAccount: (id?: number) =>
      id === 42 ? { provider: "OB", playerName: "ob1" } : undefined,
  }),
}));

describe("activeBetRunStore", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    setActivePinia(createPinia());
    const store = useActiveBetRunStore();
    store.$reset();
    store.runs.clear();
  });

  it("tracks arb begin through dual-leg success", () => {
    const store = useActiveBetRunStore();
    syncActiveBetBegin({
      match: { id: 1, title: "A vs B" } as never,
      bet: { id: 100, getBetName: () => "地图1" } as never,
      legA: { type: "OB", target: "Home", odds: 2, betMoney: 100 } as never,
      legB: { type: "RAY", target: "Away", odds: 2.1, betMoney: 95 } as never,
      accountA: { playerName: "ob1" } as never,
      accountB: { playerName: "ray1" } as never,
      linkId: 1_000,
      betBothLegs: true,
    });

    expect(store.visibleRuns).toHaveLength(1);
    expect(store.visibleRuns[0]?.phase).toBe("preparing");

    syncActiveBetAfterRejectSync(100, {
      hasA: true,
      hasB: true,
      rejectA: false,
      rejectB: false,
      okA: true,
      okB: true,
      makeupQueued: false,
    });

    expect(store.visibleRuns[0]?.phase).toBe("syncing");
    vi.advanceTimersByTime(5000);
    expect(store.visibleRuns).toHaveLength(0);
  });

  it("bootstrapFromLoseOrders marks success leg confirmed opposite makeup target", () => {
    const store = useActiveBetRunStore();
    const orders = new Map([
      [
        100,
        new LoseOrder({
          accountId: 42,
          matchId: 1,
          betId: 100,
          target: "Away",
          betMoney: 90,
          betOdds: 2.956,
          match: "G2 vs T1",
          bet: "地图4",
          linkId: 176,
        }),
      ],
    ]);
    store.bootstrapFromLoseOrders(orders);
    const run = store.visibleRuns[0];
    expect(run?.legs.find(l => l.target === "Home")?.status).toBe("confirmed");
    expect(run?.legs.find(l => l.target === "Away")?.status).toBe("makeup");
    expect(run?.legs.find(l => l.target === "Home")?.platform).toBe("OB");
  });

  it("PM delayed POST shows pending_confirm leg and phase label", () => {
    const store = useActiveBetRunStore();
    syncActiveBetBegin({
      match: { id: 1, title: "A vs B" } as never,
      bet: { id: 100, getBetName: () => "地图1" } as never,
      legA: { type: "OB", target: "Home", odds: 2, betMoney: 100 } as never,
      legB: { type: "Polymarket", target: "Away", odds: 2.1, betMoney: 95 } as never,
      accountA: { playerName: "ob1" } as never,
      accountB: { playerName: "pm1" } as never,
      linkId: 1_000,
      betBothLegs: true,
    });

    syncActiveBetPlaceResults(
      100,
      { success: true },
      { success: true, pending: true, message: "0xabc / delayed / 待确认" },
      true,
      true,
    );

    const run = store.visibleRuns[0];
    expect(run?.phase).toBe("settling");
    expect(run?.overallLabel).toBe("PM 延迟确认");
    expect(run?.legs.find(l => l.side === "B")?.status).toBe("pending_confirm");
    expect(run?.legs.find(l => l.side === "B")?.detail).toContain("PM delayed");
  });

  it("removes run when both legs fail without makeup", () => {
    const store = useActiveBetRunStore();
    syncActiveBetBegin({
      match: { id: 1, title: "A vs B" } as never,
      bet: { id: 100, getBetName: () => "地图1" } as never,
      legA: { type: "RAY", target: "Away", odds: 1.76, betMoney: 170 } as never,
      legB: { type: "Polymarket", target: "Home", odds: 2.631, betMoney: 100 } as never,
      accountA: { playerName: "ray1" } as never,
      accountB: { playerName: "pm1" } as never,
      linkId: 1_000,
      betBothLegs: true,
    });

    syncActiveBetAfterRejectSync(100, {
      hasA: true,
      hasB: true,
      rejectA: true,
      rejectB: true,
      okA: false,
      okB: false,
      makeupQueued: false,
    });

    expect(store.visibleRuns).toHaveLength(0);
  });
});
