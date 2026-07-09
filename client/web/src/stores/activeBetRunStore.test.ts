import { createPinia, setActivePinia } from "pinia";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { LoseOrder } from "@/models/loseOrder";
import { useActiveBetRunStore, legPlacementStatusLabel } from "@/stores/activeBetRunStore";
import { syncActiveBetBegin, syncActiveBetAfterRejectSync, syncActiveBetPlaceResults, syncActiveBetPhase, syncActiveBetPrecheckResults } from "@/stores/betting/activeBetRunSync";

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

  it("tracks arb begin through dual-leg success and keeps finished run in queue", () => {
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
    expect(store.visibleRuns[0]?.overallLabel).toBe("双腿已成交");
    vi.advanceTimersByTime(10_000);
    expect(store.visibleRuns).toHaveLength(1);
  });

  it("FIFO queue keeps at most 6 columns and drops oldest", () => {
    const store = useActiveBetRunStore();
    for (let i = 1; i <= 7; i += 1) {
      syncActiveBetBegin({
        match: { id: i, title: `M${i}` } as never,
        bet: { id: 1000 + i, getBetName: () => `盘${i}` } as never,
        legA: { type: "OB", target: "Home", odds: 2, betMoney: 100 } as never,
        legB: { type: "RAY", target: "Away", odds: 2.1, betMoney: 95 } as never,
        accountA: { playerName: "ob1" } as never,
        accountB: { playerName: "ray1" } as never,
        linkId: 1_000 + i,
        betBothLegs: true,
      });
    }
    expect(store.visibleRuns).toHaveLength(6);
    expect(store.visibleRuns.map(r => r.betId)).toEqual([1002, 1003, 1004, 1005, 1006, 1007]);
    expect(store.visibleRuns[0]?.matchTitle).toBe("M2");
    expect(store.visibleRuns[5]?.matchTitle).toBe("M7");
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
    expect(legPlacementStatusLabel(run!.legs.find(l => l.side === "B")!)).toBe("delayed 待确认");
    expect(run?.legs.find(l => l.side === "B")?.detail).toContain("PM delayed");
  });

  it("A8 submitted legs show 等待场馆确认 during settling", () => {
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

    syncActiveBetPlaceResults(100, { success: true }, { success: true }, true, true);

    const run = store.visibleRuns[0]!;
    expect(run.phase).toBe("settling");
    expect(run.overallLabel).toBe("等待场馆确认");
    const legA = run.legs.find(l => l.side === "A")!;
    expect(legA.status).toBe("submitted");
    expect(legPlacementStatusLabel(legA, run)).toBe("等待场馆确认");
    expect(legPlacementStatusLabel(legA)).toBe("已提交");
  });

  it("legPlacementStatusLabel maps skipped and 9999 precheck", () => {
    expect(legPlacementStatusLabel({
      side: "B",
      platform: "—",
      target: "Home",
      status: "skipped",
      events: [],
    })).toBe("不参与");

    expect(legPlacementStatusLabel({
      side: "A",
      platform: "OB",
      target: "Home",
      status: "pending",
      detail: "acc1 · 9999仅预检",
      events: [],
    })).toBe("仅预检");
  });

  it("patchLeg appends layered event when leg status changes", () => {
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

    store.setPhase(100, "placing", "提交场馆订单");
    store.patchLeg(100, "A", { status: "placing", detail: "下单中" });
    const legA = store.visibleRuns[0]?.legs.find(l => l.side === "A");
    expect(legA?.events.some(e => e.stage === "下单" && e.detail === "下单中")).toBe(true);
  });

  it("phase updates append to run timeline only, not both legs", () => {
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

    syncActiveBetPhase(100, "checking", "正在预检");

    const run = store.visibleRuns[0]!;
    expect(run.events.some(e => e.stage === "预检" && e.detail === "正在预检")).toBe(true);
    expect(run.legs.every(l => l.events.some(e => e.stage === "预检" && e.detail === "正在预检"))).toBe(true);
  });

  it("appendEvent skips consecutive duplicate stage+detail", () => {
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

    store.appendEvent(100, "预检", "正在预检");
    store.appendEvent(100, "预检", "正在预检");
    expect(store.visibleRuns[0]!.events.filter(e => e.detail === "正在预检")).toHaveLength(1);
  });

  it("precheck results append 正在预检 / 预检通过 / 预检失败", () => {
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

    const beginA = store.visibleRuns[0]!.legs.find(l => l.side === "A")!;
    expect(beginA.events.some(e => e.stage === "预检" && e.detail === "正在预检")).toBe(true);

    store.setPhase(100, "checking", "正在预检");
    syncActiveBetPrecheckResults(100, {
      hasA: true,
      okA: true,
      hasB: true,
      okB: false,
      detailB: "盘口价高于检测价",
    });

    const run = store.visibleRuns[0]!;
    const legA = run.legs.find(l => l.side === "A")!;
    const legB = run.legs.find(l => l.side === "B")!;
    expect(legA.events.some(e => e.stage === "预检" && e.detail === "预检通过")).toBe(true);
    expect(legB.status).toBe("failed");
    expect(legB.events.some(e => e.stage === "预检" && e.detail.includes("预检失败"))).toBe(true);
  });

  it("place results append 预检/下单/拒单 layered timeline", () => {
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

    store.setPhase(100, "checking", "正在预检");
    syncActiveBetPrecheckResults(100, { hasA: true, okA: true, hasB: true, okB: true });
    store.setPhase(100, "placing", "提交场馆订单");
    syncActiveBetPlaceResults(
      100,
      { success: true, message: "投注成功" },
      { success: false },
      true,
      true,
    );

    const run = store.visibleRuns[0]!;
    const legA = run.legs.find(l => l.side === "A")!;
    const legB = run.legs.find(l => l.side === "B")!;
    expect(legA.events.some(e => e.stage === "预检" && e.detail === "预检通过")).toBe(true);
    expect(legA.events.some(e => e.stage === "下单" && e.detail === "投注成功")).toBe(true);
    expect(legA.events.some(e => e.stage === "拒单" && e.detail === "等待场馆确认")).toBe(true);
    expect(legB.events.some(e => e.stage === "下单" && e.detail === "API 失败")).toBe(true);
    expect(legB.events.some(e => e.stage === "拒单")).toBe(false);
    expect(run.events.some(e => e.stage === "拒单" && e.detail === "等待场馆确认")).toBe(true);
  });

  it("keeps run when both legs fail without makeup", () => {
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

    expect(store.visibleRuns).toHaveLength(1);
    expect(store.visibleRuns[0]?.overallLabel).toBe("未成单");
  });
});
