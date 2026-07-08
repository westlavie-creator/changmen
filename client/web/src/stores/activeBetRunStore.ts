import type { LoseOrder } from "@/models/loseOrder";
import type {
  ActiveBetLeg,
  ActiveBetLegStatus,
  ActiveBetRun,
  ActiveBetRunPhase,
} from "@/types/activeBetRun";
import { defineStore } from "pinia";

const PHASE_LABEL: Record<ActiveBetRunPhase, string> = {
  preparing: "准备中",
  checking: "预检中",
  placing: "下单中",
  settling: "等待场馆确认",
  makeup: "补单中",
  syncing: "订单同步中",
};

const LEG_STATUS_LABEL: Record<ActiveBetLegStatus, string> = {
  pending: "待下单",
  placing: "下单中",
  submitted: "已提交",
  confirmed: "已确认",
  rejected: "被拒单",
  failed: "下单失败",
  makeup: "补单中",
  skipped: "未下单",
};

function defaultLeg(
  side: "A" | "B",
  platform: string,
  target: string,
  patch: Partial<ActiveBetLeg> = {},
): ActiveBetLeg {
  return {
    side,
    platform,
    target,
    status: "pending",
    ...patch,
  };
}

/** [changmen 扩展] 进行中套利/补单进度（订单列表上方展示） */
export const useActiveBetRunStore = defineStore("activeBetRun", {
  state: () => ({
    runs: new Map<number, ActiveBetRun>(),
  }),

  getters: {
    visibleRuns(state): ActiveBetRun[] {
      return [...state.runs.values()].sort((a, b) => b.updatedAt - a.updatedAt);
    },
    phaseLabel: () => (phase: ActiveBetRunPhase) => PHASE_LABEL[phase] ?? phase,
    legStatusLabel: () => (status: ActiveBetLegStatus) => LEG_STATUS_LABEL[status] ?? status,
  },

  actions: {
    upsertRun(betId: number, patch: Partial<ActiveBetRun> & Pick<ActiveBetRun, "matchId" | "matchTitle" | "betName">) {
      const now = Date.now();
      const existing = this.runs.get(betId);
      const next: ActiveBetRun = {
        betId,
        matchId: patch.matchId,
        matchTitle: patch.matchTitle,
        betName: patch.betName,
        linkId: patch.linkId ?? existing?.linkId,
        phase: patch.phase ?? existing?.phase ?? "preparing",
        overallLabel: patch.overallLabel ?? existing?.overallLabel ?? PHASE_LABEL.preparing,
        legs: patch.legs ?? existing?.legs ?? [],
        events: patch.events ?? existing?.events ?? [],
        startedAt: existing?.startedAt ?? now,
        updatedAt: now,
      };
      this.runs.set(betId, next);
    },

    appendEvent(betId: number, stage: string, detail: string) {
      const run = this.runs.get(betId);
      if (!run)
        return;
      run.events.push({ at: Date.now(), stage, detail });
      if (run.events.length > 12)
        run.events.splice(0, run.events.length - 12);
      run.updatedAt = Date.now();
    },

    setPhase(betId: number, phase: ActiveBetRunPhase, overallLabel?: string) {
      const run = this.runs.get(betId);
      if (!run)
        return;
      run.phase = phase;
      run.overallLabel = overallLabel ?? PHASE_LABEL[phase];
      run.updatedAt = Date.now();
    },

    patchLeg(betId: number, side: "A" | "B", patch: Partial<ActiveBetLeg>) {
      const run = this.runs.get(betId);
      if (!run)
        return;
      const leg = run.legs.find(l => l.side === side);
      if (!leg)
        return;
      Object.assign(leg, patch);
      run.updatedAt = Date.now();
    },

    removeRun(betId: number) {
      this.runs.delete(betId);
    },

    /** 页面刷新后从补单队列恢复「补单中」展示 */
    bootstrapFromLoseOrders(orders: Map<number, LoseOrder>) {
      for (const [betId, order] of orders) {
        if (this.runs.has(betId))
          continue;
        const pendingPm = String(order.pendingPmOrderId ?? "").trim();
        this.upsertRun(betId, {
          matchId: order.matchId,
          matchTitle: order.match,
          betName: order.bet,
          linkId: order.linkId,
          phase: "makeup",
          overallLabel: pendingPm ? "补单中 · 等待 PM 确认" : PHASE_LABEL.makeup,
          legs: [
            defaultLeg("A", "—", order.target, {
              status: "makeup",
              detail: `补 ${order.target}`,
            }),
            defaultLeg("B", "—", order.target === "Home" ? "Away" : "Home", {
              status: "skipped",
            }),
          ],
        });
        this.appendEvent(betId, "补单", pendingPm ? "续查 PM 订单" : "队列已恢复");
      }
    },
  },
});
