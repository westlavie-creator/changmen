import { createPinia, setActivePinia } from "pinia";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useActiveBetRunStore } from "@/stores/activeBetRunStore";
import { syncActiveBetBegin, syncActiveBetAfterRejectSync } from "@/stores/betting/activeBetRunSync";

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
});
