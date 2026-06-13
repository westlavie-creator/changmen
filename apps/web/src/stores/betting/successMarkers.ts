import type { BetSide } from "@/models/match";
import type { PlatformAccount } from "@/models/platformAccount";
import {
  incrementBetCount,
  incrementGameBetCount,
  setLastBetOdds,
} from "@/shared/betTiming";

const BET_ACCOUNT_PREFIX = "BETACCOUNT:";

export function readUsedAccounts(betRowId: number, side: string) {
  try {
    const raw = sessionStorage.getItem(`${BET_ACCOUNT_PREFIX}${betRowId}:${side}`);
    return raw ? (JSON.parse(raw) as number[]) : [];
  } catch {
    return [];
  }
}

function markUsedAccount(accountId: number, betRowId: number, side: BetSide) {
  const key = `${BET_ACCOUNT_PREFIX}${betRowId}:${side}`;
  const list = readUsedAccounts(betRowId, side);
  if (!list.includes(accountId)) {
    list.push(accountId);
    sessionStorage.setItem(key, JSON.stringify(list));
  }
}

/** 对齐 bundle `_()`：成功且未拒单后标记账号与下注计数 */
export function markSuccessfulBet(
  account: PlatformAccount,
  betId: number,
  side: BetSide,
  odds: number,
  gameName?: string,
) {
  markUsedAccount(account.accountId, betId, side);
  incrementBetCount(account.accountId, betId, side);
  setLastBetOdds(account.accountId, betId, side, odds);
  if (gameName) incrementGameBetCount(account.accountId, gameName);
}
