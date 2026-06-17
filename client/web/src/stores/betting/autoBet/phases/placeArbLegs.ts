import type { ViewBet, ViewMatch } from "@/models/match";
import { BetResult } from "@/models/betResult";
import type { UserConfig } from "@/types/userConfig";
import { useAccountStore } from "@/stores/accountStore";
import { retryFailedLeg } from "@/stores/betting/autoBet/retryFailedLeg";
import type { ArbBetChecked, ArbBetPlaced } from "@/stores/betting/autoBet/phases/types";

/** 下单 + anyOdds 换腿重试；失败时返回 null */
export async function placeArbLegs(
  match: ViewMatch,
  bet: ViewBet,
  config: UserConfig,
  checked: ArbBetChecked,
): Promise<ArbBetPlaced | null> {
  const accountStore = useAccountStore();
  let { legA, legB, accountA, accountB, betBothLegs, waitSec } = checked;

  let resultA: BetResult | undefined;
  let resultB: BetResult | undefined;
  if (!betBothLegs) {
    if (accountA) {
      resultA = await accountStore.betting(accountA, legA, waitSec);
      if (!resultA?.success) {
        return null;
      }
    } else {
      resultB = await accountStore.betting(accountB!, legB, waitSec);
      if (!resultB?.success) {
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
      return null;
    }
  } else {
    resultA = await accountStore.betting(accountA!, legA, waitSec);
    if (!resultA.success) {
      return null;
    }
    resultB = await accountStore.betting(accountB!, legB, waitSec);
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
