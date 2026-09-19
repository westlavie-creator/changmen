import type { BetResult } from "@changmen/client-core/models/betResult";
import type { PlatformAccount } from "@/models/platformAccount";
import type { BetOption } from "@changmen/client-core/models/betOption";
import type {
  ArbBetAttemptParams,
  ArbBetChecked,
  ArbBetPlaced,
  ArbLegPlaceOutcome,
} from "@/stores/betting/autoBet/phases/types";
import { resolveArbLegPlaceOutcome } from "@/stores/betting/autoBet/phases/types";
import { formatBetResult } from "@/shared/arbBetTraceFormat";
import { isPendingConfirmVenueProvider } from "@changmen/shared/account_multiply";
import { useAccountStore } from "@/stores/accountStore";
import { retryFailedLeg } from "@/stores/betting/autoBet/retryFailedLeg";
import {
  canRelockInstantQuote,
  isMixedPendingConfirmArbPair,
  mixedInstantIsLegA,
} from "@/stores/betting/autoBet/phases/mixedPendingConfirmPair";
import { mixedPendingAskAboveDetection } from "@/stores/betting/autoBet/phases/mixedPendingFoGuard";
import {
  syncActiveBetLeg,
  syncActiveBetPhase,
  syncActiveBetPlaceResults,
} from "@/stores/betting/activeBetRunSync";

/**
 * 仅用户选 Parallel 且非混合对时走 A8 并发 POST。
 * 混合对的并发在 mixedDual（预检齐后再 Promise.all），不经本函数。
 */
export function shouldPlaceLegsInParallel(
  betSorting: string | undefined,
  legAType?: unknown,
  legBType?: unknown,
): boolean {
  if (betSorting !== "Parallel")
    return false;
  if (legAType != null && legBType != null && isMixedPendingConfirmArbPair(legAType, legBType))
    return false;
  return true;
}

function buildPlaced(
  checked: ArbBetChecked,
  legA: BetOption,
  legB: BetOption,
  accountA: PlatformAccount | undefined,
  accountB: PlatformAccount | undefined,
  resultA: BetResult | undefined,
  resultB: BetResult | undefined,
  placeOutcomeA: ArbLegPlaceOutcome,
  placeOutcomeB: ArbLegPlaceOutcome,
): ArbBetPlaced {
  return {
    ...checked,
    legA,
    legB,
    accountA,
    accountB,
    resultA,
    resultB,
    placeOutcomeA,
    placeOutcomeB,
  };
}

function hasPlaceQuote(option: BetOption): boolean {
  return option.data != null;
}

function stripPlaceError(raw?: string): string {
  if (!raw)
    return "";
  return raw.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}

function mixedSkipReason(
  option: BetOption,
  kind: "pending" | "instant",
  foBlock?: string | null,
): string {
  const err = stripPlaceError(option.checkError);
  if (foBlock)
    return `${option.type} ${option.target}: 检测价已不能成交（${foBlock}）`;
  const verb = kind === "pending" ? "临下单复检失败" : "检测价重锁失败";
  return err
    ? `${option.type} ${option.target}: ${verb}（${err}）`
    : `${option.type} ${option.target}: ${verb}`;
}

type MixedGateResult = {
  legA: BetOption;
  legB: BetOption;
  blocked: boolean;
  reason?: string;
};

async function recheckMixedPendingIfNeeded(
  accountStore: ReturnType<typeof useAccountStore>,
  legA: BetOption,
  legB: BetOption,
  accountA: PlatformAccount | undefined,
  accountB: PlatformAccount | undefined,
  trace: ArbBetAttemptParams["trace"],
): Promise<MixedGateResult> {
  if (!isMixedPendingConfirmArbPair(legA.type, legB.type))
    return { legA, legB, blocked: false };
  const instantIsA = mixedInstantIsLegA(legA, legB);
  const pending = instantIsA ? legB : legA;
  const pendingAccount = instantIsA ? accountB : accountA;
  if (!pendingAccount || !isPendingConfirmVenueProvider(pending.type))
    return { legA, legB, blocked: false };
  const rechecked = await accountStore.checkBetting(pendingAccount, pending, {
    skipStakeResolve: true,
  });
  if (instantIsA)
    legB = rechecked;
  else
    legA = rechecked;
  if (!hasPlaceQuote(rechecked)) {
    const reason = mixedSkipReason(rechecked, "pending");
    trace?.event("预检", reason);
    return { legA, legB, blocked: true, reason };
  }
  return { legA, legB, blocked: false };
}

async function relockInstantAtDetectionOdds(
  accountStore: ReturnType<typeof useAccountStore>,
  instant: BetOption,
  instantAccount: PlatformAccount,
  scanOdds: number,
): Promise<BetOption> {
  instant.data = null;
  if (scanOdds > 0)
    instant.odds = scanOdds;
  // 资格预检已换成场馆额；再检只验检测价，不改 betMoney
  return accountStore.checkBetting(instantAccount, instant, { skipStakeResolve: true });
}

async function relockMixedInstantIfNeeded(
  accountStore: ReturnType<typeof useAccountStore>,
  checked: ArbBetChecked,
  legA: BetOption,
  legB: BetOption,
  accountA: PlatformAccount | undefined,
  accountB: PlatformAccount | undefined,
  trace: ArbBetAttemptParams["trace"],
): Promise<MixedGateResult> {
  if (!isMixedPendingConfirmArbPair(legA.type, legB.type))
    return { legA, legB, blocked: false };
  const instantIsA = mixedInstantIsLegA(legA, legB);
  const instantAccount = instantIsA ? accountA : accountB;
  if (!instantAccount)
    return { legA, legB, blocked: false };
  const instant = instantIsA ? legA : legB;
  if (!canRelockInstantQuote(instant.type)) {
    // OB/TF：再预检就是往下单端点重复提交同一注单，沿用预检冻价 POST；赔率是否还在由场馆裁决
    if (hasPlaceQuote(instant))
      return { legA, legB, blocked: false };
    const reason = `${instant.type} ${instant.target}: 预检冻价缺失，取消下单`;
    trace?.event("预检", reason);
    return { legA, legB, blocked: true, reason };
  }
  const relocked = await relockInstantAtDetectionOdds(
    accountStore,
    instantIsA ? legA : legB,
    instantAccount,
    instantIsA ? checked.scanOddsA : checked.scanOddsB,
  );
  if (instantIsA)
    legA = relocked;
  else
    legB = relocked;
  if (!hasPlaceQuote(relocked)) {
    const reason = mixedSkipReason(relocked, "instant");
    trace?.event("预检", reason);
    return { legA, legB, blocked: true, reason };
  }
  return { legA, legB, blocked: false };
}

/**
 * 下单 + anyOdds 换腿重试。
 * 预检通过后始终回传双侧 place 结果给编排层（finalize）；不在此 trace.finish / abort。
 * 场馆拒单判定不在本层。
 */
export async function placeArbLegs(
  params: ArbBetAttemptParams,
  checked: ArbBetChecked,
): Promise<ArbBetPlaced> {
  const { match, bet, config, trace } = params;
  const accountStore = useAccountStore();
  let { legA, legB, accountA, accountB, betBothLegs, waitSec, linkId } = checked;
  const placeOpts = { linkId, requirePreparedQuote: true };

  if (isPendingConfirmVenueProvider(legA.type))
    legA.deferPostAcceptSettlement = true;
  if (isPendingConfirmVenueProvider(legB.type))
    legB.deferPostAcceptSettlement = true;

  syncActiveBetPhase(bet.id, "placing", "提交场馆订单");

  let resultA: BetResult | undefined;
  let resultB: BetResult | undefined;
  let attemptedA = false;
  let attemptedB = false;

  if (accountA)
    syncActiveBetLeg(bet.id, "A", "placing");
  if (accountB)
    syncActiveBetLeg(bet.id, "B", "placing");

  const mixedPair = isMixedPendingConfirmArbPair(legA.type, legB.type);
  let mixedBlocked = false;
  let mixedBlockReason = "";
  if (mixedPair) {
    // 双腿：先确认 CLOB 仍可成交，再锁即时馆；两张单都就绪后同时 POST。
    // 若先 relock 再等 /book，会把刚冻的 RAY 价再等死（9/15 的 501）。
    // 若等雷 HTTP 200 再打 PM，对冲腿被人为拖在后面。
    // OB/TF 不重锁（canRelockInstantQuote）：重锁等于重复提交，会把两腿一起挡掉。
    if (betBothLegs && accountA && accountB) {
      const pending = mixedInstantIsLegA(legA, legB) ? legB : legA;
      const foBlock = mixedPendingAskAboveDetection(pending);
      if (foBlock) {
        mixedBlockReason = mixedSkipReason(pending, "pending", foBlock);
        trace?.event("预检", mixedBlockReason);
        mixedBlocked = true;
      }
      if (!mixedBlocked) {
        const pendingRecheck = await recheckMixedPendingIfNeeded(
          accountStore,
          legA,
          legB,
          accountA,
          accountB,
          trace,
        );
        legA = pendingRecheck.legA;
        legB = pendingRecheck.legB;
        mixedBlocked = pendingRecheck.blocked;
        if (pendingRecheck.reason)
          mixedBlockReason = pendingRecheck.reason;
      }
    }
    if (!mixedBlocked) {
      const relocked = await relockMixedInstantIfNeeded(
        accountStore,
        checked,
        legA,
        legB,
        accountA,
        accountB,
        trace,
      );
      legA = relocked.legA;
      legB = relocked.legB;
      mixedBlocked = relocked.blocked;
      if (relocked.reason)
        mixedBlockReason = relocked.reason;
    }
  }
  else if (betBothLegs && accountA && accountB && (!hasPlaceQuote(legA) || !hasPlaceQuote(legB))) {
    mixedBlockReason = "双侧预检未齐，取消下单";
    trace?.event("预检", mixedBlockReason);
    mixedBlocked = true;
  }

  const mixedDual = Boolean(mixedPair && betBothLegs && accountA && accountB && !mixedBlocked);

  if (mixedDual) {
    trace?.event("下单", `并行 ${legA.type} + ${legB.type}`);
    attemptedA = true;
    attemptedB = true;
    const pair = await Promise.all([
      accountStore.betting(accountA!, legA, waitSec, placeOpts),
      accountStore.betting(accountB!, legB, waitSec, placeOpts),
    ]);
    resultA = pair[0];
    resultB = pair[1];
  }
  else if (!mixedBlocked && !betBothLegs) {
    if (accountA) {
      trace?.event("下单", `开始 ${legA.type} ${legA.target}`);
      attemptedA = true;
      resultA = await accountStore.betting(accountA, legA, waitSec, placeOpts);
    }
    else {
      trace?.event("下单", `开始 ${legB.type} ${legB.target}`);
      attemptedB = true;
      resultB = await accountStore.betting(accountB!, legB, waitSec, placeOpts);
    }
  }
  else if (!mixedBlocked && shouldPlaceLegsInParallel(config.betSorting, legA.type, legB.type)) {
    trace?.event("下单", `并行 ${legA.type} + ${legB.type}`);
    attemptedA = true;
    attemptedB = true;
    const pair = await Promise.all([
      accountStore.betting(accountA!, legA, waitSec, placeOpts),
      accountStore.betting(accountB!, legB, waitSec, placeOpts),
    ]);
    resultA = pair[0];
    resultB = pair[1];
    if (resultA?.success || !pair.some(r => r?.success)) {
      // keep leg/account assignment
    }
    else if (resultB?.success) {
      [legA, legB] = [legB, legA];
      [accountA, accountB] = [accountB, accountA];
      resultA = pair[1];
      resultB = pair[0];
    }
  }
  else if (!mixedBlocked) {
    trace?.event("下单", `顺序 ${legA.type} → ${legB.type}`);
    attemptedA = true;
    resultA = await accountStore.betting(accountA!, legA, waitSec, placeOpts);
    if (resultA.success) {
      attemptedB = true;
      resultB = await accountStore.betting(accountB!, legB, waitSec, placeOpts);
    }
    // A 失败：B 保持 not_attempted，仍回传编排层
  }

  if (resultB?.success && !resultA?.success) {
    [legA, legB] = [legB, legA];
    [accountA, accountB] = [accountB, accountA];
    [resultA, resultB] = [resultB, resultA];
    [attemptedA, attemptedB] = [attemptedB, attemptedA];
  }

  trace?.event(
    "下单",
    [
      accountA || attemptedA
        ? formatBetResult(legA.type, legA.target, legA.betMoney, legA.odds, resultA)
        : `${legA.type} ${legA.target} 未下单`,
      accountB || attemptedB
        ? formatBetResult(legB.type, legB.target, legB.betMoney, legB.odds, resultB)
        : `${legB.type} ${legB.target} 未下单`,
    ]
      .filter(Boolean)
      .join(" · "),
  );

  if (betBothLegs && resultA?.success && !resultB?.success && attemptedB) {
    trace?.event("重试", `anyOdds 换腿补 ${legB.type} ${legB.target}`);
    const retry = await retryFailedLeg(
      match,
      bet,
      legA,
      legB,
      accountA,
      config,
      waitSec,
      trace,
      linkId,
    );
    if (retry) {
      resultB = retry.result;
      legB = retry.leg;
      accountB = retry.account;
      attemptedB = true;
      trace?.event(
        "重试",
        formatBetResult(legB.type, legB.target, legB.betMoney, legB.odds, resultB),
      );
    }
    else {
      trace?.event("重试", "换腿未成功");
    }
  }

  const placeOutcomeA = resolveArbLegPlaceOutcome(attemptedA, resultA);
  const placeOutcomeB = resolveArbLegPlaceOutcome(attemptedB, resultB);

  syncActiveBetPlaceResults(
    bet.id,
    resultA,
    resultB,
    Boolean(accountA),
    Boolean(accountB),
    placeOutcomeA,
    placeOutcomeB,
    mixedBlocked ? mixedBlockReason || undefined : undefined,
  );

  return buildPlaced(
    checked,
    legA,
    legB,
    accountA,
    accountB,
    resultA,
    resultB,
    placeOutcomeA,
    placeOutcomeB,
  );
}
