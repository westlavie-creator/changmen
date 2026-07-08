import type { BetOption } from "@/models/betOption";
import type { ViewBet, ViewMatch } from "@/models/match";
import type { PlatformAccount } from "@/models/platformAccount";
import type { ActiveBetLegStatus, ActiveBetRunPhase } from "@/types/activeBetRun";
import { getActivePinia } from "pinia";
import { useActiveBetRunStore } from "@/stores/activeBetRunStore";

function activeStore() {
  if (!getActivePinia())
    return undefined;
  return useActiveBetRunStore();
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
  linkId: number;
  betBothLegs: boolean;
}) {
  const store = activeStore();
  if (!store)
    return;
  const { match, bet, legA, legB, accountA, accountB, linkId, betBothLegs } = params;

  const legs = [
    legFromOption("A", legA, accountA, accountA ? "pending" : "skipped"),
    legFromOption("B", legB, accountB, accountB ? "pending" : "skipped"),
  ];
  if (!betBothLegs) {
    if (accountA)
      legs[1].status = "skipped";
    else if (accountB)
      legs[0].status = "skipped";
  }

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
) {
  const store = activeStore();
  if (!store)
    return;
  store.setPhase(betId, phase);
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

export function syncActiveBetPlaceResults(
  betId: number,
  resultA?: { success?: boolean },
  resultB?: { success?: boolean },
  hasA?: boolean,
  hasB?: boolean,
) {
  if (hasA) {
    syncActiveBetLeg(
      betId,
      "A",
      resultA?.success ? "submitted" : "failed",
      resultA?.success ? "API 成功" : "API 失败",
    );
  }
  if (hasB) {
    syncActiveBetLeg(
      betId,
      "B",
      resultB?.success ? "submitted" : "failed",
      resultB?.success ? "API 成功" : "API 失败",
    );
  }
  syncActiveBetPhase(betId, "settling", "等待拒单检测");
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
    store.setPhase(betId, "syncing", "双腿已确认，同步订单列表…");
    store.appendEvent(betId, "完成", "双腿成单");
    setTimeout(() => store.removeRun(betId), 4000);
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
  const store = activeStore();
  if (!store)
    return;
  if (!store.runs.has(betId))
    return;
  store.setPhase(betId, "makeup", `补单中 · ${platform}`);
  store.appendEvent(betId, "补单", detail);
}

export function syncActiveBetMakeupSettling(betId: number, waitSec: number) {
  syncActiveBetPhase(betId, "settling", `补单已提交，等待 ${waitSec}s`);
}

export function syncActiveBetMakeupRejected(betId: number, target: string) {
  const store = activeStore();
  if (!store)
    return;
  store.setPhase(betId, "makeup", `${target} 再次被拒单`);
  store.appendEvent(betId, "拒单", `${target} 再次被拒单`);
}

export function syncActiveBetMakeupDone(betId: number, platform: string, odds: number) {
  const store = activeStore();
  if (!store)
    return;
  store.setPhase(betId, "syncing", `补单成功 ${platform}@${odds}`);
  store.appendEvent(betId, "完成", "补单成功");
  setTimeout(() => store.removeRun(betId), 4000);
}
