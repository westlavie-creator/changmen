import type { ViewBet, ViewMatch } from "@/models/match";
import { BetResult } from "@/models/betResult";
import type { UserConfig } from "@/types/userConfig";
import { useAccountStore } from "@/stores/accountStore";
import { traceBetLeg } from "@/stores/betting/autoBet/arbBetTrace";
import { retryFailedLeg } from "@/stores/betting/autoBet/retryFailedLeg";
import type { ArbBetChecked, ArbBetPlaced } from "@/stores/betting/autoBet/phases/types";

/** 下单 + anyOdds 换腿重试；失败时 trace.finish 并返回 null */
export async function placeArbLegs(
  match: ViewMatch,
  bet: ViewBet,
  config: UserConfig,
  checked: ArbBetChecked,
): Promise<ArbBetPlaced | null> {
  const accountStore = useAccountStore();
  let { legA, legB, accountA, accountB, trace, betBothLegs, strictA8, waitSec } = checked;

  let resultA: BetResult | undefined;
  let resultB: BetResult | undefined;
  if (!strictA8 && !betBothLegs) {
    if (accountA) {
      resultA = await accountStore.betting(accountA, legA, waitSec);
      traceBetLeg(trace, legA, accountA, resultA);
      if (!resultA?.success) {
        trace.finish("fail", "单边下单失败");
        return null;
      }
    } else {
      resultB = await accountStore.betting(accountB!, legB, waitSec);
      traceBetLeg(trace, legB, accountB, resultB);
      if (!resultB?.success) {
        trace.finish("fail", "单边下单失败");
        return null;
      }
    }
  } else if (config.betSorting === "Parallel") {
    const pair = await Promise.all([
      accountStore.betting(accountA!, legA, waitSec),
      accountStore.betting(accountB!, legB, waitSec),
    ]);
    resultA = pair[0];
    resultB = pair[1];
    if (resultA?.success || !pair.some((r) => r?.success)) {
      // keep leg/account assignment
    } else if (resultB?.success) {
      [legA, legB] = [legB, legA];
      [accountA, accountB] = [accountB, accountA];
      resultA = pair[1];
      resultB = pair[0];
    }
    if (!resultA?.success) {
      traceBetLeg(trace, legA, accountA, resultA);
      traceBetLeg(trace, legB, accountB, resultB);
      trace.finish("fail", "双腿下单均失败");
      return null;
    }
  } else {
    resultA = await accountStore.betting(accountA!, legA, waitSec);
    traceBetLeg(trace, legA, accountA, resultA);
    if (!resultA.success) {
      trace.finish("fail", "首腿下单失败");
      return null;
    }
    resultB = await accountStore.betting(accountB!, legB, waitSec);
    traceBetLeg(trace, legB, accountB, resultB);
  }

  if (betBothLegs && resultA?.success && !resultB?.success) {
    const retry = await retryFailedLeg(match, bet, legA, legB, config, waitSec);
    if (retry) {
      resultB = retry.result;
      legB = retry.leg;
      accountB = retry.account;
    }
  }

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
