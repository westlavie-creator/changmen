import type { BetOption } from "@changmen/client-core/models/betOption";
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
  events: { at: number; stage: string; detail: string }[];
} {
  return {
    side,
    platform: leg.type,
    target: leg.target,
    odds: leg.odds,
    betMoney: leg.betMoney,
    status,
    detail: account?.playerName,
    events: [],
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
  if (checkAccountA)
    store.appendLegEvent(bet.id, "A", "预检", "正在预检");
  if (checkAccountB)
    store.appendLegEvent(bet.id, "B", "预检", "正在预检");
}

/** 预检结束：每腿追加「预检通过」或「预检失败」，并刷新整单标题/时间线 */
export function syncActiveBetPrecheckResults(
  betId: number,
  results: {
    hasA?: boolean;
    okA?: boolean;
    detailA?: string;
    hasB?: boolean;
    okB?: boolean;
    detailB?: string;
  },
) {
  const store = activeStore();
  if (!store)
    return;
  if (results.hasA) {
    if (results.okA) {
      store.appendLegEvent(betId, "A", "预检", "预检通过");
    }
    else {
      const detail = results.detailA?.trim()
        ? `预检失败 · ${results.detailA.trim()}`
        : "预检失败";
      store.patchLeg(betId, "A", { status: "failed", detail });
    }
  }
  if (results.hasB) {
    if (results.okB) {
      store.appendLegEvent(betId, "B", "预检", "预检通过");
    }
    else {
      const detail = results.detailB?.trim()
        ? `预检失败 · ${results.detailB.trim()}`
        : "预检失败";
      store.patchLeg(betId, "B", { status: "failed", detail });
    }
  }

  const checked: boolean[] = [];
  if (results.hasA)
    checked.push(Boolean(results.okA));
  if (results.hasB)
    checked.push(Boolean(results.okB));
  if (!checked.length)
    return;

  if (checked.some(ok => !ok)) {
    // 腿详情已在各腿时间线；整单只更新顶部标题，避免仍停在「正在预检」
    store.setPhase(betId, "syncing", "预检失败");
    return;
  }

  store.setPhase(betId, "checking", "预检通过");
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
  // 整单状态只更新顶部 overallLabel；细节走各腿时间线
  store.setPhase(betId, phase, detail, countdownSec);
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
    syncActiveBetLeg(betId, side, "rejected", "拒单");
    return;
  }
  // 拒单层：未拒单（检测通过）；整单收尾再标「已成交」
  syncActiveBetLeg(betId, side, "confirmed", "未拒单");
}

/** [changmen 扩展] SaveOrderBind 重试仍失败时上屏 */
export function syncActiveBetBindFailed(
  betId: number,
  sides: Array<"A" | "B">,
  detail = "绑单失败",
) {
  const store = activeStore();
  if (!store || !sides.length)
    return;
  for (const side of sides)
    store.appendLegEvent(betId, side, "拒单", detail);
  store.setPhase(betId, "syncing", detail);
}

/** [changmen 扩展] 绑单成功：腿时间线追加「已绑单」（不覆盖拒单层结果） */
export function syncActiveBetBindSuccess(
  betId: number,
  sides: Array<"A" | "B">,
  detail = "已绑单",
) {
  const store = activeStore();
  if (!store || !sides.length)
    return;
  for (const side of sides)
    store.appendLegEvent(betId, side, "拒单", detail);
}

type PostLegResult = { success?: boolean; pending?: boolean; message?: string | null };
type PlaceOutcome = "filled_pending_settle" | "api_failed" | "not_attempted";

function legStatusAfterPost(
  result?: PostLegResult,
  placeOutcome?: PlaceOutcome,
): ActiveBetLegStatus {
  if (placeOutcome === "not_attempted")
    return "failed";
  if (!result?.success)
    return "failed";
  if (result.pending)
    return "pending_confirm";
  return "submitted";
}

function legDetailAfterPost(
  result?: PostLegResult,
  placeOutcome?: PlaceOutcome,
): string {
  if (placeOutcome === "not_attempted")
    return "未下单";
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
  placeOutcomeA?: PlaceOutcome,
  placeOutcomeB?: PlaceOutcome,
) {
  const store = activeStore();
  if (hasA) {
    syncActiveBetLeg(
      betId,
      "A",
      legStatusAfterPost(resultA, placeOutcomeA),
      legDetailAfterPost(resultA, placeOutcomeA),
    );
    // 非 PM delayed：进入拒单检测层（追加，不覆盖）；仅 API 成功腿
    if (store && resultA?.success && !resultA.pending)
      store.appendLegEvent(betId, "A", "拒单", "等待场馆确认");
  }
  if (hasB) {
    syncActiveBetLeg(
      betId,
      "B",
      legStatusAfterPost(resultB, placeOutcomeB),
      legDetailAfterPost(resultB, placeOutcomeB),
    );
    if (store && resultB?.success && !resultB.pending)
      store.appendLegEvent(betId, "B", "拒单", "等待场馆确认");
  }
  const anyApiOk = Boolean(
    (hasA && resultA?.success) || (hasB && resultB?.success),
  );
  if (!anyApiOk) {
    syncActiveBetPhase(betId, "syncing", "下单未成功");
    return;
  }
  const pmPending = Boolean((hasA && resultA?.pending) || (hasB && resultB?.pending));
  syncActiveBetPhase(betId, "settling", pmPending ? "PM 延迟确认" : "等待场馆确认");
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
  if (makeupLeg)
    store.appendLegEvent(betId, makeupLeg.side, "补单", detail);
}

function finalizeLegDetail(flags: {
  ok: boolean;
  reject: boolean;
  placeOutcome?: PlaceOutcome;
}): string | undefined {
  if (flags.ok)
    return "已成交";
  if (flags.reject)
    return "拒单";
  if (flags.placeOutcome === "not_attempted")
    return "未下单";
  if (flags.placeOutcome === "api_failed")
    return "下单失败";
  return undefined;
}

export function syncActiveBetAfterRejectSync(
  betId: number,
  flags: {
    hasA: boolean;
    hasB: boolean;
    rejectA: boolean;
    rejectB: boolean;
    pendingConfirmA?: boolean;
    pendingConfirmB?: boolean;
    okA: boolean;
    okB: boolean;
    makeupQueued: boolean;
    makeupTarget?: "A" | "B";
    makeupPlatform?: string;
    placeOutcomeA?: PlaceOutcome;
    placeOutcomeB?: PlaceOutcome;
  },
) {
  const store = activeStore();
  if (!store)
    return;

  const pendingA = Boolean(flags.pendingConfirmA);
  const pendingB = Boolean(flags.pendingConfirmB);

  if (flags.hasA) {
    store.patchLeg(betId, "A", {
      status: flags.okA
        ? "confirmed"
        : pendingA
          ? "pending_confirm"
          : flags.rejectA
            ? "rejected"
            : "failed",
      detail: pendingA
        ? "delayed 待确认"
        : finalizeLegDetail({
          ok: flags.okA,
          reject: flags.rejectA,
          placeOutcome: flags.placeOutcomeA,
        }),
    });
  }
  if (flags.hasB) {
    store.patchLeg(betId, "B", {
      status: flags.okB
        ? "confirmed"
        : pendingB
          ? "pending_confirm"
          : flags.rejectB
            ? "rejected"
            : "failed",
      detail: pendingB
        ? "delayed 待确认"
        : finalizeLegDetail({
          ok: flags.okB,
          reject: flags.rejectB,
          placeOutcome: flags.placeOutcomeB,
        }),
    });
  }

  if (flags.okA && flags.okB) {
    if (flags.hasA)
      store.appendLegEvent(betId, "A", "拒单", "已成交");
    if (flags.hasB)
      store.appendLegEvent(betId, "B", "拒单", "已成交");
    store.scheduleDismiss(betId);
    return;
  }

  // 一腿成、一腿拒：成功腿标已成交，拒单腿进补单（或保持补单中）
  if (flags.okA && flags.hasA)
    store.appendLegEvent(betId, "A", "拒单", "已成交");
  if (flags.okB && flags.hasB)
    store.appendLegEvent(betId, "B", "拒单", "已成交");
  if (flags.rejectA && flags.hasA)
    store.appendLegEvent(betId, "A", "拒单", "拒单");
  if (flags.rejectB && flags.hasB)
    store.appendLegEvent(betId, "B", "拒单", "拒单");
  if (pendingA && flags.hasA)
    store.appendLegEvent(betId, "A", "拒单", "delayed 待确认");
  if (pendingB && flags.hasB)
    store.appendLegEvent(betId, "B", "拒单", "delayed 待确认");

  // 待确认续查：挂补单队列但腿态保持 pending_confirm（jb 续查原单，非立刻重下）
  if (flags.makeupQueued && (pendingA || pendingB)) {
    store.setPhase(betId, "makeup", "PM 延迟确认");
    if (flags.makeupTarget && flags.makeupPlatform) {
      store.patchLeg(betId, flags.makeupTarget, {
        status: "pending_confirm",
        platform: flags.makeupPlatform,
        detail: "待确认 · 下轮续查",
      });
      store.appendLegEvent(betId, flags.makeupTarget, "补单", "续查原单（未确认不补新单）");
    }
    return;
  }

  if (flags.makeupQueued || ((flags.okA || flags.okB) && (flags.rejectA || flags.rejectB))) {
    store.setPhase(betId, "makeup", "补单中");
    if (flags.makeupQueued && flags.makeupTarget && flags.makeupPlatform) {
      store.patchLeg(betId, flags.makeupTarget, {
        status: "makeup",
        platform: flags.makeupPlatform,
        detail: "已入补单队列",
      });
      store.appendLegEvent(
        betId,
        flags.makeupTarget,
        "补单",
        flags.makeupPlatform ? `补 ${flags.makeupPlatform}` : "已入队",
      );
    }
    return;
  }

  if (pendingA || pendingB) {
    store.setPhase(betId, "settling", "PM 延迟确认");
    return;
  }

  if (!flags.okA && !flags.okB) {
    if (flags.hasA)
      store.appendLegEvent(betId, "A", "拒单", "未成单");
    if (flags.hasB)
      store.appendLegEvent(betId, "B", "拒单", "未成单");
    store.setPhase(betId, "syncing", "未成单");
    return;
  }

  store.setPhase(betId, "settling", "部分成功，等待后续");
}

export function syncActiveBetFail(betId: number, reason: string) {
  const store = activeStore();
  if (!store)
    return;
  const run = store.runs.get(betId);
  const failLayer = run?.phase === "checking" || run?.phase === "preparing"
    ? "预检"
    : run?.phase === "settling" || run?.phase === "syncing"
      ? "拒单"
      : "下单";
  const parts = reason.split(" · ").map(s => s.trim()).filter(Boolean);
  if (run && parts.length > 1) {
    for (const part of parts) {
      const leg = run.legs.find((row) => {
        const prefix = `${row.platform} ${row.target}:`;
        return part.startsWith(prefix) || part.startsWith(`${row.platform} `);
      });
      if (!leg)
        continue;
      const detail = part.includes(":") ? part.slice(part.indexOf(":") + 1).trim() : part;
      if (leg.status !== "failed")
        store.patchLeg(betId, leg.side, { status: "failed", detail: detail || part });
      else
        store.appendLegEvent(betId, leg.side, failLayer, detail || part);
    }
  }
  else {
    for (const leg of run?.legs ?? []) {
      if (leg.status !== "skipped" && leg.status !== "failed")
        store.appendLegEvent(betId, leg.side, failLayer, reason);
    }
  }
  store.setPhase(betId, "syncing", reason || "失败");
}

/** @deprecated 完成后不再定时移除；保留空实现以免旧调用报错 */
export function scheduleActiveBetRunRemoval(_betId: number, _delayMs = 6000) {
  // FIFO 队列：失败/完成均留在面板，超出 5 列时由 upsertRun.trimQueueFifo 挤出
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
          events: [],
        },
        {
          side: targetSide === "A" ? "B" : "A",
          platform: "—",
          target: target === "Home" ? "Away" : "Home",
          status: "skipped",
          events: [],
        },
      ],
    });
  }
  else {
    store.setPhase(betId, "makeup", "补单中");
    store.patchLeg(betId, targetSide, { status: "makeup", platform, detail: "已入补单队列" });
  }
  store.appendLegEvent(betId, targetSide, "补单", `${platform} 入队`);
}

export function syncActiveBetMakeupAttempt(
  betId: number,
  platform: string,
  detail: string,
  targetSide?: "A" | "B",
) {
  syncMakeupListPhase(betId, "placing");
  const store = activeStore();
  if (!store)
    return;
  if (!store.runs.has(betId))
    return;
  const side = targetSide ?? store.runs.get(betId)?.legs.find(l => l.status === "makeup")?.side;
  store.setPhase(betId, "makeup", `补单中 · ${platform}`);
  if (side)
    store.appendLegEvent(betId, side, "补单", detail);
}

export function syncActiveBetMakeupSettling(betId: number, waitSec: number) {
  syncMakeupListPhase(betId, "settling");
  const store = activeStore();
  const makeupLeg = store?.runs.get(betId)?.legs.find(l => l.status === "makeup" || l.status === "pending_confirm");
  syncActiveBetPhase(betId, "settling", "补单已提交，等待场馆确认", waitSec);
  if (store && makeupLeg)
    store.appendLegEvent(betId, makeupLeg.side, "补单", "等待场馆确认");
}

export function syncActiveBetMakeupRejected(betId: number, target: string) {
  syncMakeupListPhase(betId, "rejected_retry");
  const store = activeStore();
  if (!store)
    return;
  const run = store.runs.get(betId);
  const makeupLeg = run?.legs.find(l => l.status === "makeup" || l.target === target);
  store.setPhase(betId, "makeup", `${target} 再次被拒单`);
  if (makeupLeg)
    store.appendLegEvent(betId, makeupLeg.side, "补单", `${target} 再次被拒单`);
}

export function syncActiveBetMakeupDone(betId: number, platform: string, odds: number) {
  syncMakeupListPhase(betId, undefined);
  const store = activeStore();
  if (!store)
    return;
  const run = store.runs.get(betId);
  const makeupLeg = run?.legs.find(l => l.status === "makeup" || l.platform === platform);
  const detail = `补单成功 @${odds}`;
  if (makeupLeg)
    store.appendLegEvent(betId, makeupLeg.side, "补单", detail);
  store.scheduleDismiss(betId);
}
