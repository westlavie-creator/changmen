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

async function recheckMixedPendingIfNeeded(
  accountStore: ReturnType<typeof useAccountStore>,
  legA: BetOption,
  legB: BetOption,
  accountA: PlatformAccount | undefined,
  accountB: PlatformAccount | undefined,
  trace: ArbBetAttemptParams["trace"],
): Promise<{ legA: BetOption; legB: BetOption; blocked: boolean }> {
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
    trace?.event(
      "预检",
      `${rechecked.type} ${rechecked.target}: 检测价已不能成交${rechecked.checkError ? `（${rechecked.checkError}）` : ""}`,
    );
    return { legA, legB, blocked: true };
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
): Promise<{ legA: BetOption; legB: BetOption; blocked: boolean }> {
  if (!isMixedPendingConfirmArbPair(legA.type, legB.type))
    return { legA, legB, blocked: false };
  const instantIsA = mixedInstantIsLegA(legA, legB);
  const instantAccount = instantIsA ? accountA : accountB;
  if (!instantAccount)
    return { legA, legB, blocked: false };
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
    trace?.event(
      "预检",
      `${relocked.type} ${relocked.target}: 检测价已不能成交${relocked.checkError ? `（${relocked.checkError}）` : ""}`,
    );
    return { legA, legB, blocked: true };
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
  if (mixedPair) {
    // 双腿：先确认 CLOB 仍可成交，再锁即时馆；两张单都就绪后同时 POST。
    // 若先 relock 再等 /book，会把刚冻的 RAY 价再等死（9/15 的 501）。
    // 若等雷 HTTP 200 再打 PM，对冲腿被人为拖在后面。
    if (betBothLegs && accountA && accountB) {
      const pending = mixedInstantIsLegA(legA, legB) ? legB : legA;
      const foBlock = mixedPendingAskAboveDetection(pending);
      if (foBlock) {
        trace?.event(
          "预检",
          `${pending.type} ${pending.target}: 检测价已不能成交（${foBlock}）`,
        );
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
    }
  }
  else if (betBothLegs && accountA && accountB && (!hasPlaceQuote(legA) || !hasPlaceQuote(legB))) {
    trace?.event("预检", "双侧预检未齐，取消下单");
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
