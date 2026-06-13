import { BetOption, opponentSide } from "@/models/betOption";
import type { ViewBet, ViewBetItem, ViewMatch } from "@/models/match";
import type { PlatformAccount } from "@/models/platformAccount";
import { BetResult } from "@/models/betResult";
import type { UserConfig } from "@/types/userConfig";
import type { PlatformId } from "@/types/esport";
import { passesMaxBetCount } from "@/shared/betTiming";
import { useAccountStore } from "@/stores/accountStore";
import { useMatchStore } from "@/stores/matchStore";
import {
  passesDefaultOddsAccount,
} from "@/stores/betting/betFilters";
import { readUsedAccounts } from "@/stores/betting/successMarkers";

/**
 * 对齐 bundle：一侧成功、一侧失败时换平台重试失败腿（最多 3 轮）。
 * anyOdds 仅影响最低赔阈值（makeProfit vs anyOddsProfit）。
 */
export async function retryFailedLeg(
  match: ViewMatch,
  bet: ViewBet,
  successLeg: BetOption,
  failedLeg: BetOption,
  config: UserConfig,
  waitSec: number,
): Promise<{ leg: BetOption; account: PlatformAccount; result: BetResult } | null> {
  const accountStore = useAccountStore();
  const matchStore = useMatchStore();
  const profitThreshold = config.anyOdds ? config.anyOddsProfit : config.makeProfit;
  const minOdds = 1 / (1 / profitThreshold - 1 / successLeg.odds);

  const tried: PlatformId[] = [];

  for (let round = 0; round < 3; round++) {
    bet.items.forEach((item) => item.updateOdds());

    const candidates = bet.items
      .filter(
        (item) =>
          !tried.includes(item.type) &&
          item.getOdds(failedLeg.target) >= minOdds,
      )
      .sort(
        (a, b) => b.getOdds(failedLeg.target) - a.getOdds(failedLeg.target),
      );

    if (!candidates.length) break;

    let pickedAccount: PlatformAccount | undefined;
    let pickedItem: ViewBetItem | undefined;
    let stake = 0;
    let odds = 0;

    for (const item of candidates) {
      odds = item.getOdds(failedLeg.target);
      stake = Math.floor((successLeg.odds * successLeg.betMoney) / odds);
      const acc = accountStore.getAccount(
        item.type,
        stake,
        config.noSameBet
          ? readUsedAccounts(bet.id, opponentSide(failedLeg.target))
          : [],
        (u) => {
          if (u.isPause() || tried.includes(u.provider)) return false;
          if (!u.checkOdds(odds, match.gameId)) return false;
          const retryImplied = 1 / (1 / successLeg.odds + 1 / odds);
          if (!u.passesGameSettings(match.game, odds, retryImplied)) return false;
          if (!passesDefaultOddsAccount(u, bet.id, failedLeg.target)) return false;
          if (!passesMaxBetCount(u, bet.id, failedLeg.target)) return false;
          const target = matchStore.getBetTarget(u.provider, bet.id);
          if (target && target !== failedLeg.target) return false;
          return true;
        },
      );
      if (acc) {
        pickedAccount = acc;
        pickedItem = item;
        break;
      }
    }

    if (!pickedAccount || !pickedItem) break;

    tried.push(pickedAccount.provider);
    let retryLeg = new BetOption(match, bet, pickedItem, failedLeg.target, stake);
    retryLeg = await accountStore.checkBetting(pickedAccount, retryLeg);
    if (!retryLeg.data) continue;

    const result = await accountStore.betting(pickedAccount, retryLeg, waitSec);
    if (result?.success) {
      return { leg: retryLeg, account: pickedAccount, result };
    }
  }

  return null;
}
