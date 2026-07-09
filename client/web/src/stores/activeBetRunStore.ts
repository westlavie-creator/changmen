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
  pending_confirm: "delayed 待确认",
  confirmed: "已确认",
  rejected: "被拒单",
  failed: "下单失败",
  makeup: "补单中",
  skipped: "不参与",
};

/** 腿时间线分层：预检 → 下单 → 拒单（补单单独一层） */
export type ActiveBetLegEventLayer = "预检" | "下单" | "拒单" | "补单";

export function legEventLayerForStatus(
  status: ActiveBetLegStatus,
  phase?: ActiveBetRunPhase,
): ActiveBetLegEventLayer {
  if (status === "makeup" || phase === "makeup")
    return "补单";
  if (status === "confirmed" || status === "rejected")
    return "拒单";
  if (status === "placing" || status === "submitted" || status === "pending_confirm")
    return "下单";
  if (status === "failed") {
    if (phase === "checking" || phase === "preparing")
      return "预检";
    if (phase === "settling" || phase === "syncing")
      return "拒单";
    return "下单";
  }
  if (phase === "settling" || phase === "syncing")
    return "拒单";
  if (phase === "placing")
    return "下单";
  return "预检";
}

function isPmLeg(leg: ActiveBetLeg): boolean {
  return leg.platform === "Polymarket";
}

/** 侧栏「下单状态」取值（含 A8/PM 待确认拆分、9999 仅预检等） */
export function legPlacementStatusLabel(
  leg: ActiveBetLeg,
  run?: Pick<ActiveBetRun, "phase">,
): string {
  if (leg.status === "skipped")
    return "不参与";
  if (leg.status === "pending" && leg.detail?.includes("仅预检"))
    return "仅预检";
  if (leg.status === "pending_confirm")
    return "delayed 待确认";
  if (leg.status === "submitted" && run?.phase === "settling" && !isPmLeg(leg))
    return "等待场馆确认";
  return LEG_STATUS_LABEL[leg.status] ?? leg.status;
}

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

const MAX_LEG_EVENTS = 20;
const MAX_RUN_EVENTS = 12;

function trimEvents<T>(list: T[], cap: number) {
  if (list.length > cap)
    list.splice(0, list.length - cap);
}

function isSameEvent(
  prev: { stage: string; detail: string } | undefined,
  stage: string,
  detail: string,
): boolean {
  return Boolean(prev && prev.stage === stage && prev.detail === detail);
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

/** 进行中订单队列上限（FIFO：超出时挤掉最旧一笔） */
export const ACTIVE_BET_RUN_QUEUE_CAP = 6;

/** @deprecated 保留兼容；完成后不再定时消失，改由 FIFO 队列挤出 */
export const ACTIVE_BET_RUN_DISMISS_SEC = 0;

/** [changmen 扩展] 进行中套利/补单进度（订单列表上方展示） */
export const useActiveBetRunStore = defineStore("activeBetRun", {
  state: () => ({
    runs: new Map<number, ActiveBetRun>(),
  }),

  getters: {
    /** 左旧右新：配合 CSS flex-end 靠右显示 */
    visibleRuns(state): ActiveBetRun[] {
      return [...state.runs.values()].sort((a, b) => a.startedAt - b.startedAt || a.betId - b.betId);
    },
    phaseLabel: () => (phase: ActiveBetRunPhase) => PHASE_LABEL[phase] ?? phase,
    legStatusLabel: () => (status: ActiveBetLegStatus) => LEG_STATUS_LABEL[status] ?? status,
    legPlacementLabel: () => (leg: ActiveBetLeg, run?: ActiveBetRun) =>
      legPlacementStatusLabel(leg, run),
  },

  actions: {
    /** 超出上限时移除最旧一笔（先进先出） */
    trimQueueFifo(keepBetId?: number) {
      while (this.runs.size > ACTIVE_BET_RUN_QUEUE_CAP) {
        const oldest = [...this.runs.values()]
          .filter(r => r.betId !== keepBetId)
          .sort((a, b) => a.startedAt - b.startedAt || a.betId - b.betId)[0];
        if (!oldest)
          break;
        this.runs.delete(oldest.betId);
      }
    },

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
      if (!existing)
        this.trimQueueFifo(betId);
    },

    appendEvent(betId: number, stage: string, detail: string) {
      const run = this.runs.get(betId);
      if (!run)
        return;
      if (isSameEvent(run.events[run.events.length - 1], stage, detail))
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
      if (isSameEvent(leg.events[leg.events.length - 1], stage, detail))
        return;
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
      if (patch.status && patch.status !== prevStatus && patch.status !== "skipped" && patch.status !== "pending") {
        const layer = legEventLayerForStatus(patch.status, run.phase);
        const eventDetail = patch.detail?.trim()
          ? patch.detail
          : (LEG_STATUS_LABEL[patch.status] ?? patch.status);
        this.appendLegEvent(betId, side, layer, eventDetail);
      }
      run.updatedAt = Date.now();
    },

    /** 双腿已成交：标记完成并留在队列（不自动消失；满 6 列时 FIFO 挤出） */
    scheduleDismiss(betId: number, _delaySec = ACTIVE_BET_RUN_DISMISS_SEC) {
      const run = this.runs.get(betId);
      if (!run)
        return;
      this.setPhase(betId, "syncing", "双腿已成交");
      run.countdownUntil = undefined;
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
