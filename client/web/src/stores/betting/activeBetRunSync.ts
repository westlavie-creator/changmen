import type { BetOption } from "@/models/betOption";
import type { ViewBet, ViewMatch } from "@/models/match";
import type { PlatformAccount } from "@/models/platformAccount";
import type { ActiveBetLegStatus, ActiveBetRunPhase } from "@/types/activeBetRun";
import type { MakeupRuntimePhase } from "@/types/order";
import { getActivePinia } from "pinia";
import { useActiveBetRunStore } from "@/stores/activeBetRunStore";
import { useLoseOrderStore } from "@/stores/loseOrderStore";

function activeStore() {
  if (!getActivePinia())
    return undefined;
  return useActiveBetRunStore();
}

function syncMakeupListPhase(betId: number, phase: MakeupRuntimePhase | undefined) {
  if (!getActivePinia())
    return;
  useLoseOrderStore().setMakeupRuntimePhase(betId, phase);
}

function legFromOption(
  side: "A" | "B",
  leg: BetOption,
  account?: PlatformAccount,
  status: ActiveBetLegStatus = "pending",
): {
  side: "A" | "B";
  platform: string;
  target: string;
  odds: number;
  betMoney: number;
  status: ActiveBetLegStatus;
  detail?: string;
} {
  return {
    side,
    platform: leg.type,
    target: leg.target,
    odds: leg.odds,
    betMoney: leg.betMoney,
    status,
    detail: account?.playerName,
  };
}

/** 选腿成功：创建/刷新进行中记录 */
export function syncActiveBetBegin(params: {
  match: ViewMatch;
  bet: ViewBet;
  legA: BetOption;
  legB: BetOption;
  accountA?: PlatformAccount;
  accountB?: PlatformAccount;
  checkAccountA?: PlatformAccount;
  checkAccountB?: PlatformAccount;
  linkId: number;
  betBothLegs: boolean;
}) {
  const store = activeStore();
  if (!store)
    return;
  const {
    match,
    bet,
    legA,
    legB,
    accountA,
    accountB,
    checkAccountA: checkAIn,
    checkAccountB: checkBIn,
    linkId,
  } = params;
  const checkAccountA = checkAIn ?? accountA;
  const checkAccountB = checkBIn ?? accountB;

  function beginLeg(
    side: "A" | "B",
    leg: BetOption,
    betAccount?: PlatformAccount,
    checkAccount?: PlatformAccount,
  ): ReturnType<typeof legFromOption> {
    if (!checkAccount)
      return legFromOption(side, leg, undefined, "skipped");
    const row = legFromOption(side, leg, checkAccount, "pending");
    if (checkAccount && !betAccount)
      row.detail = [checkAccount.playerName, "9999仅预检"].filter(Boolean).join(" · ");
    return row;
  }

  const legs = [
    beginLeg("A", legA, accountA, checkAccountA),
    beginLeg("B", legB, accountB, checkAccountB),
  ];

  store.upsertRun(bet.id, {
    matchId: match.id,
    matchTitle: match.title,
    betName: bet.getBetName(),
    linkId,
    phase: "preparing",
    overallLabel: "准备套利",
    legs,
  });
  store.appendEvent(bet.id, "检测", `${legA.type} vs ${legB.type}`);
}

export function syncActiveBetPhase(
  betId: number,
  phase: ActiveBetRunPhase,
  detail?: string,
  countdownSec?: number,
) {
  const store = activeStore();
  if (!store)
    return;
  store.setPhase(betId, phase, detail, countdownSec);
  if (detail)
    store.appendEvent(betId, phase, detail);
}

export function syncActiveBetLeg(
  betId: number,
  side: "A" | "B",
  status: ActiveBetLegStatus,
  detail?: string,
) {
  const store = activeStore();
  if (!store)
    return;
  store.patchLeg(betId, side, { status, detail });
}

/** 单腿拒单检测结束后立即刷新 UI（不必等另一腿） */
export function syncActiveBetLegSettleResult(
  betId: number,
  side: "A" | "B",
  apiSuccess: boolean,
  venueRejected: boolean,
) {
  if (!apiSuccess) {
    syncActiveBetLeg(betId, side, "failed");
    return;
  }
  if (venueRejected) {
    syncActiveBetLeg(betId, side, "rejected", "场馆拒单");
    return;
  }
  syncActiveBetLeg(betId, side, "confirmed", "已确认");
}

type PostLegResult = { success?: boolean; pending?: boolean; message?: string | null };

function legStatusAfterPost(result?: PostLegResult): ActiveBetLegStatus {
  if (!result?.success)
    return "failed";
  if (result.pending)
    return "pending_confirm";
  return "submitted";
}

function legDetailAfterPost(result?: PostLegResult): string {
  if (!result?.success)
    return "API 失败";
  if (result.pending)
    return "PM delayed 待确认";
  const msg = String(result.message ?? "").trim();
  return msg || "API 成功";
}

export function syncActiveBetPlaceResults(
  betId: number,
  resultA?: PostLegResult,
  resultB?: PostLegResult,
  hasA?: boolean,
  hasB?: boolean,
) {
  if (hasA) {
    syncActiveBetLeg(
      betId,
      "A",
      legStatusAfterPost(resultA),
      legDetailAfterPost(resultA),
    );
  }
  if (hasB) {
    syncActiveBetLeg(
      betId,
      "B",
      legStatusAfterPost(resultB),
      legDetailAfterPost(resultB),
    );
  }
  const pmPending = Boolean((hasA && resultA?.pending) || (hasB && resultB?.pending));
  syncActiveBetPhase(betId, "settling", pmPending ? "PM 延迟确认" : "等待拒单检测");
}

/** PM 补单 POST 返回 delayed：腿行与阶段立即反映待确认 */
export function syncActiveBetMakeupPmDelayed(betId: number, orderId?: string | null) {
  const store = activeStore();
  if (!store)
    return;
  const run = store.runs.get(betId);
  const makeupLeg = run?.legs.find(l => l.status === "makeup" || l.status === "pending_confirm");
  const idHint = String(orderId ?? "").trim();
  const detail = idHint
    ? `PM delayed 待确认 · ${idHint.slice(0, 10)}…`
    : "PM delayed 待确认";
  if (makeupLeg)
    store.patchLeg(betId, makeupLeg.side, { status: "makeup", detail });
  store.setPhase(betId, "makeup", "PM 延迟确认");
  store.appendEvent(betId, "补单", detail);
}

export function syncActiveBetAfterRejectSync(
  betId: number,
  flags: {
    hasA: boolean;
    hasB: boolean;
    rejectA: boolean;
    rejectB: boolean;
    okA: boolean;
    okB: boolean;
    makeupQueued: boolean;
    makeupTarget?: "A" | "B";
    makeupPlatform?: string;
  },
) {
  const store = activeStore();
  if (!store)
    return;

  if (flags.hasA) {
    store.patchLeg(betId, "A", {
      status: flags.okA ? "confirmed" : flags.rejectA ? "rejected" : "failed",
      detail: flags.okA ? "已确认" : flags.rejectA ? "场馆拒单" : undefined,
    });
  }
  if (flags.hasB) {
    store.patchLeg(betId, "B", {
      status: flags.okB ? "confirmed" : flags.rejectB ? "rejected" : "failed",
      detail: flags.okB ? "已确认" : flags.rejectB ? "场馆拒单" : undefined,
    });
  }

  if (flags.okA && flags.okB) {
    store.appendEvent(betId, "完成", "双腿成单");
    store.scheduleDismiss(betId);
    return;
  }

  if (flags.makeupQueued) {
    store.setPhase(betId, "makeup", "补单中");
    if (flags.makeupTarget && flags.makeupPlatform) {
      store.patchLeg(betId, flags.makeupTarget, {
        status: "makeup",
        platform: flags.makeupPlatform,
        detail: "已入补单队列",
      });
    }
    store.appendEvent(betId, "补单", flags.makeupPlatform ? `补 ${flags.makeupPlatform}` : "已入队");
    return;
  }

  if (!flags.okA && !flags.okB) {
    store.appendEvent(betId, "结束", "双腿均未成单");
    store.removeRun(betId);
    return;
  }

  store.setPhase(betId, "settling", "部分成功，等待后续");
}

export function syncActiveBetFail(betId: number, reason: string) {
  const store = activeStore();
  if (!store)
    return;
  store.appendEvent(betId, "失败", reason);
  setTimeout(() => store.removeRun(betId), 6000);
}

export function syncActiveBetMakeupEnqueue(
  betId: number,
  targetSide: "A" | "B",
  platform: string,
  target: string,
) {
  const store = activeStore();
  if (!store)
    return;
  const run = store.runs.get(betId);
  if (!run) {
    store.upsertRun(betId, {
      matchId: 0,
      matchTitle: "",
      betName: "",
      phase: "makeup",
      overallLabel: "补单中",
      legs: [
        {
          side: targetSide,
          platform,
          target,
          status: "makeup",
        },
        {
          side: targetSide === "A" ? "B" : "A",
          platform: "—",
          target: target === "Home" ? "Away" : "Home",
          status: "skipped",
        },
      ],
    });
  }
  else {
    store.setPhase(betId, "makeup", "补单中");
    store.patchLeg(betId, targetSide, { status: "makeup", platform, detail: "已入补单队列" });
  }
  store.appendEvent(betId, "补单", `${platform} 入队`);
}

export function syncActiveBetMakeupAttempt(
  betId: number,
  platform: string,
  detail: string,
) {
  syncMakeupListPhase(betId, "placing");
  const store = activeStore();
  if (!store)
    return;
  if (!store.runs.has(betId))
    return;
  store.setPhase(betId, "makeup", `补单中 · ${platform}`);
  store.appendEvent(betId, "补单", detail);
}

export function syncActiveBetMakeupSettling(betId: number, waitSec: number) {
  syncMakeupListPhase(betId, "settling");
  syncActiveBetPhase(betId, "settling", "补单已提交，等待场馆确认", waitSec);
}

export function syncActiveBetMakeupRejected(betId: number, target: string) {
  syncMakeupListPhase(betId, "rejected_retry");
  const store = activeStore();
  if (!store)
    return;
  store.setPhase(betId, "makeup", `${target} 再次被拒单`);
  store.appendEvent(betId, "拒单", `${target} 再次被拒单`);
}

export function syncActiveBetMakeupDone(betId: number, platform: string, odds: number) {
  syncMakeupListPhase(betId, undefined);
  const store = activeStore();
  if (!store)
    return;
  store.appendEvent(betId, "完成", "补单成功");
  store.scheduleDismiss(betId);
}
