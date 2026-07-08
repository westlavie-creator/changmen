import type { LoseOrder } from "@/models/loseOrder";
import { opponentSide } from "@/models/betOption";
import type {
  ActiveBetLeg,
  ActiveBetLegStatus,
  ActiveBetRun,
  ActiveBetRunPhase,
} from "@/types/activeBetRun";
import { defineStore } from "pinia";
import { useAccountStore } from "@/stores/accountStore";

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
  pending_confirm: "PM delayed",
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
  const { events, ...rest } = patch;
  return {
    side,
    platform,
    target,
    status: "pending",
    events: events ?? [],
    ...rest,
  };
}

const MAX_LEG_EVENTS = 12;
const MAX_RUN_EVENTS = 8;

function trimEvents<T>(list: T[], cap: number) {
  if (list.length > cap)
    list.splice(0, list.length - cap);
}

function legsFromLoseOrder(order: LoseOrder): ActiveBetLeg[] {
  const makeupTarget = order.target;
  const successTarget = opponentSide(makeupTarget);
  const account = useAccountStore().findAccount(order.accountId);
  const successPlatform = account?.provider ?? "—";
  return [
    defaultLeg("A", successPlatform, successTarget, {
      status: "confirmed",
      betMoney: order.betMoney,
      odds: order.betOdds,
      detail: account?.playerName ?? "已成单",
    }),
    defaultLeg("B", "—", makeupTarget, {
      status: "makeup",
      detail: `补 ${makeupTarget}`,
    }),
  ];
}

/** 双腿均成交后，面板保留时长（秒） */
export const ACTIVE_BET_RUN_DISMISS_SEC = 3;

const dismissTimers = new Map<number, ReturnType<typeof setTimeout>>();

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
        countdownUntil: patch.countdownUntil !== undefined
          ? patch.countdownUntil
          : existing?.countdownUntil,
      };
      this.runs.set(betId, next);
    },

    appendEvent(betId: number, stage: string, detail: string) {
      const run = this.runs.get(betId);
      if (!run)
        return;
      run.events.push({ at: Date.now(), stage, detail });
      trimEvents(run.events, MAX_RUN_EVENTS);
      run.updatedAt = Date.now();
    },

    appendLegEvent(betId: number, side: "A" | "B", stage: string, detail: string) {
      const run = this.runs.get(betId);
      if (!run)
        return;
      const leg = run.legs.find(l => l.side === side);
      if (!leg)
        return;
      if (!leg.events)
        leg.events = [];
      leg.events.push({ at: Date.now(), stage, detail });
      trimEvents(leg.events, MAX_LEG_EVENTS);
      run.updatedAt = Date.now();
    },

    setPhase(
      betId: number,
      phase: ActiveBetRunPhase,
      overallLabel?: string,
      countdownSec?: number,
    ) {
      const run = this.runs.get(betId);
      if (!run)
        return;
      run.phase = phase;
      run.overallLabel = overallLabel ?? PHASE_LABEL[phase];
      if (countdownSec != null && countdownSec > 0 && (phase === "settling" || phase === "syncing")) {
        run.countdownUntil = Date.now() + countdownSec * 1000;
      }
      else if (phase !== "settling" && phase !== "syncing") {
        run.countdownUntil = undefined;
      }
      run.updatedAt = Date.now();
    },

    patchLeg(betId: number, side: "A" | "B", patch: Partial<ActiveBetLeg>) {
      const run = this.runs.get(betId);
      if (!run)
        return;
      const leg = run.legs.find(l => l.side === side);
      if (!leg)
        return;
      if (!leg.events)
        leg.events = [];
      const prevStatus = leg.status;
      Object.assign(leg, patch);
      if (patch.status && patch.status !== prevStatus) {
        const label = LEG_STATUS_LABEL[patch.status] ?? patch.status;
        const eventDetail = patch.detail?.trim()
          ? patch.detail
          : leg.platform;
        this.appendLegEvent(betId, side, label, eventDetail);
      }
      run.updatedAt = Date.now();
    },

    /** 双腿已成交：保留 N 秒再收起（可重复调用会重置计时） */
    scheduleDismiss(betId: number, delaySec = ACTIVE_BET_RUN_DISMISS_SEC) {
      const existing = dismissTimers.get(betId);
      if (existing)
        clearTimeout(existing);
      const run = this.runs.get(betId);
      if (!run)
        return;
      this.setPhase(betId, "syncing", `双腿已成交，${delaySec}秒后收起`, delaySec);
      dismissTimers.set(betId, setTimeout(() => {
        dismissTimers.delete(betId);
        this.removeRun(betId);
      }, delaySec * 1000));
    },

    removeRun(betId: number) {
      const pending = dismissTimers.get(betId);
      if (pending) {
        clearTimeout(pending);
        dismissTimers.delete(betId);
      }
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
          legs: legsFromLoseOrder(order),
        });
        this.appendEvent(betId, "补单", pendingPm ? "续查 PM 订单" : "队列已恢复");
        const makeupLeg = this.runs.get(betId)?.legs.find(l => l.status === "makeup");
        if (makeupLeg)
          this.appendLegEvent(betId, makeupLeg.side, "补单", pendingPm ? "续查 PM 订单" : "队列已恢复");
      }
    },
  },
});
