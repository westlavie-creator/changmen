import type { BetResult } from "@/models/betResult";
import type { ArbExecutionTrace } from "@/stores/betting/autoBet/arbExecutionTrace";
import type { ArbBetAttemptParams, ArbBetChecked, ArbBetPlaced } from "@/stores/betting/autoBet/phases/types";
import { formatBetResult } from "@/shared/arbBetTraceFormat";
import { PLATFORMS } from "@/shared/platform";
import { useAccountStore } from "@/stores/accountStore";
import { retryFailedLeg } from "@/stores/betting/autoBet/retryFailedLeg";
import {
  syncActiveBetFail,
  syncActiveBetLeg,
  syncActiveBetPhase,
  syncActiveBetPlaceResults,
} from "@/stores/betting/activeBetRunSync";

function finishPlaceFailure(
  betId: number,
  trace: ArbExecutionTrace | undefined,
  legA: { type: string; target: string; betMoney: number; odds: number },
  legB: { type: string; target: string; betMoney: number; odds: number },
  resultA?: BetResult,
  resultB?: BetResult,
): null {
  trace?.event(
    "下单",
    [
      formatBetResult(legA.type, legA.target, legA.betMoney, legA.odds, resultA),
      formatBetResult(legB.type, legB.target, legB.betMoney, legB.odds, resultB),
    ].join(" · "),
  );
  trace?.finish("fail", "下单未成功");
  syncActiveBetFail(betId, "下单未成功");
  return null;
}

/** 下单 + anyOdds 换腿重试；失败时 trace.finish 并返回 null */
export async function placeArbLegs(
  params: ArbBetAttemptParams,
  checked: ArbBetChecked,
): Promise<ArbBetPlaced | null> {
  const { match, bet, config, trace } = params;
  const accountStore = useAccountStore();
  let { legA, legB, accountA, accountB, betBothLegs, waitSec } = checked;

  if (legA.type === PLATFORMS.Polymarket)
    legA.deferPmSettlement = true;
  if (legB.type === PLATFORMS.Polymarket)
    legB.deferPmSettlement = true;

  syncActiveBetPhase(bet.id, "placing", "提交场馆订单");
  if (accountA)
    syncActiveBetLeg(bet.id, "A", "placing");
  if (accountB)
    syncActiveBetLeg(bet.id, "B", "placing");

  let resultA: BetResult | undefined;
  let resultB: BetResult | undefined;
  if (!betBothLegs) {
    if (accountA) {
      trace?.event("下单", `开始 ${legA.type} ${legA.target}`);
      resultA = await accountStore.betting(accountA, legA, waitSec);
      if (!resultA?.success) {
        return finishPlaceFailure(bet.id, trace, legA, legB, resultA, resultB);
      }
    }
    else {
      trace?.event("下单", `开始 ${legB.type} ${legB.target}`);
      resultB = await accountStore.betting(accountB!, legB, waitSec);
      if (!resultB?.success) {
        return finishPlaceFailure(bet.id, trace, legA, legB, resultA, resultB);
      }
    }
  }
  else if (config.betSorting === "Parallel") {
    trace?.event("下单", `并行 ${legA.type} + ${legB.type}`);
    const pair = await Promise.all([
      accountStore.betting(accountA!, legA, waitSec),
      accountStore.betting(accountB!, legB, waitSec),
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
    if (!resultA?.success) {
      return finishPlaceFailure(bet.id, trace, legA, legB, resultA, resultB);
    }
  }
  else {
    trace?.event("下单", `顺序 ${legA.type} → ${legB.type}`);
    resultA = await accountStore.betting(accountA!, legA, waitSec);
    if (!resultA.success) {
      return finishPlaceFailure(bet.id, trace, legA, legB, resultA, resultB);
    }
    resultB = await accountStore.betting(accountB!, legB, waitSec);
  }

  trace?.event(
    "下单",
    [
      accountA ? formatBetResult(legA.type, legA.target, legA.betMoney, legA.odds, resultA) : null,
      accountB ? formatBetResult(legB.type, legB.target, legB.betMoney, legB.odds, resultB) : null,
    ]
      .filter(Boolean)
      .join(" · "),
  );

  if (betBothLegs && resultA?.success && !resultB?.success) {
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
    );
    if (retry) {
      resultB = retry.result;
      legB = retry.leg;
      accountB = retry.account;
      trace?.event(
        "重试",
        formatBetResult(legB.type, legB.target, legB.betMoney, legB.odds, resultB),
      );
    }
    else {
      trace?.event("重试", "换腿未成功");
    }
  }

  syncActiveBetPlaceResults(
    bet.id,
    resultA,
    resultB,
    Boolean(accountA),
    Boolean(accountB),
  );

  return {
    ...checked,
    legA,
    legB,
    accountA,
    accountB,
    resultA,
    resultB,
  };
}
