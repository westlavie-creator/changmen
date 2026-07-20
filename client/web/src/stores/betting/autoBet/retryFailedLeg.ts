import type { BetResult } from "@changmen/client-core/models/betResult";
import type { ViewBet, ViewBetItem, ViewMatch } from "@/models/match";
import type { PlatformAccount } from "@/models/platformAccount";
import type { ArbExecutionTrace } from "@/stores/betting/autoBet/arbExecutionTrace";
import type { PlatformId } from "@/types/esport";
import type { UserConfig } from "@/types/userConfig";
import { hedgeStakeCnyFromLeg } from "@/domain/polymarket/pmArbStake";
import { isSingleLegRateAtOdds } from "@/domain/betting/singleLegRate";
import { BetOption, opponentSide } from "@changmen/client-core/models/betOption";
import { isPendingConfirmVenueProvider } from "@changmen/shared/account_multiply";
import { useAccountStore } from "@/stores/accountStore";
import { readUsedAccounts } from "@/stores/betting/successMarkers";
import { useMatchStore } from "@/stores/matchStore";

/**
 * 对齐 bundle：一侧成功、一侧失败时换平台重试失败腿（最多 3 轮）。
 * anyOdds 仅影响最低赔阈值（makeProfit vs anyOddsProfit）。
 * 选账号 filter 与 bundle 主循环 anyOdds 段一致：pause / 已试平台 / minOdds / betTarget。
 */
export async function retryFailedLeg(
  match: ViewMatch,
  bet: ViewBet,
  successLeg: BetOption,
  failedLeg: BetOption,
  successAccount: PlatformAccount | undefined,
  config: UserConfig,
  waitSec: number,
  trace?: ArbExecutionTrace,
): Promise<{ leg: BetOption; account: PlatformAccount; result: BetResult } | null> {
  const accountStore = useAccountStore();
  const matchStore = useMatchStore();
  const profitThreshold = config.anyOdds ? config.anyOddsProfit : config.makeProfit;
  const minOdds = 1 / (1 / profitThreshold - 1 / successLeg.odds);

  const tried: PlatformId[] = [];

  for (let round = 0; round < 3; round++) {
    bet.items.forEach(item => item.updateOdds());

    const candidates = bet.items
      .filter(
        item =>
          !tried.includes(item.type)
          && item.getOdds(failedLeg.target) >= minOdds,
      )
      .sort(
        (a, b) => b.getOdds(failedLeg.target) - a.getOdds(failedLeg.target),
      );

    if (!candidates.length)
      break;

    let pickedAccount: PlatformAccount | undefined;
    let pickedItem: ViewBetItem | undefined;
    let stake = 0;

    for (const item of candidates) {
      const odds = item.getOdds(failedLeg.target);
      stake = hedgeStakeCnyFromLeg(
        successLeg.odds,
        successLeg.betMoney,
        successLeg.type,
        odds,
        successAccount,
      );
      const acc = accountStore.getAccount(
        item.type,
        stake,
        config.noSameBet
          ? readUsedAccounts(bet.id, opponentSide(failedLeg.target))
          : [],
        (u) => {
          if (u.isPause() || tried.includes(u.provider))
            return false;
          if (isSingleLegRateAtOdds(u, odds))
            return false;
          if (u.getMinOdds() > odds)
            return false;
          const target = matchStore.getBetTarget(u.provider, bet.id);
          if (target && target !== failedLeg.target)
            return false;
          return true;
        },
      );
      if (acc) {
        pickedAccount = acc;
        pickedItem = item;
        break;
      }
    }

    if (!pickedAccount || !pickedItem)
      break;

    tried.push(pickedAccount.provider);
    let retryLeg = new BetOption(match, bet, pickedItem, failedLeg.target, stake);
    retryLeg.odds = pickedItem.getOdds(failedLeg.target);
    if (isPendingConfirmVenueProvider(pickedAccount.provider))
      retryLeg.deferPmSettlement = true;
    trace?.event("重试", `第 ${round + 1} 轮 ${pickedAccount.provider}@${retryLeg.odds}`);
    retryLeg = await accountStore.checkBetting(pickedAccount, retryLeg);
    if (!retryLeg.data)
      continue;

    const result = await accountStore.betting(pickedAccount, retryLeg, waitSec);
    if (result?.success) {
      return { leg: retryLeg, account: pickedAccount, result };
    }
  }

  return null;
}
