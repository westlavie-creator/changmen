import type { BetResult } from "@/models/betResult";
import type { PlatformAccount } from "@/models/platformAccount";
import type { BetOption } from "@/models/betOption";
import type {
  ArbBetAttemptParams,
  ArbBetChecked,
  ArbBetPlaced,
  ArbLegPlaceOutcome,
} from "@/stores/betting/autoBet/phases/types";
import { resolveArbLegPlaceOutcome } from "@/stores/betting/autoBet/phases/types";
import { formatBetResult } from "@/shared/arbBetTraceFormat";
import { PLATFORMS } from "@/shared/platform";
import { useAccountStore } from "@/stores/accountStore";
import { retryFailedLeg } from "@/stores/betting/autoBet/retryFailedLeg";
import {
  syncActiveBetLeg,
  syncActiveBetPhase,
  syncActiveBetPlaceResults,
} from "@/stores/betting/activeBetRunSync";

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
  let attemptedA = false;
  let attemptedB = false;

  if (!betBothLegs) {
    if (accountA) {
      trace?.event("下单", `开始 ${legA.type} ${legA.target}`);
      attemptedA = true;
      resultA = await accountStore.betting(accountA, legA, waitSec);
    }
    else {
      trace?.event("下单", `开始 ${legB.type} ${legB.target}`);
      attemptedB = true;
      resultB = await accountStore.betting(accountB!, legB, waitSec);
    }
  }
  else if (config.betSorting === "Parallel") {
    trace?.event("下单", `并行 ${legA.type} + ${legB.type}`);
    attemptedA = true;
    attemptedB = true;
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
  }
  else {
    trace?.event("下单", `顺序 ${legA.type} → ${legB.type}`);
    attemptedA = true;
    resultA = await accountStore.betting(accountA!, legA, waitSec);
    if (resultA.success) {
      attemptedB = true;
      resultB = await accountStore.betting(accountB!, legB, waitSec);
    }
    // A 失败：B 保持 not_attempted，仍回传编排层
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
