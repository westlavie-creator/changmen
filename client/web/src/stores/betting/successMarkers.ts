import type { BetSide } from "@/models/match";
import type { PlatformAccount } from "@/models/platformAccount";
import { incrementBetCount, setLastBetOdds } from "@/shared/betTiming";

const BET_ACCOUNT_PREFIX = "BETACCOUNT:";

export function readUsedAccounts(betRowId: number, side: string) {
  try {
    const raw = sessionStorage.getItem(`${BET_ACCOUNT_PREFIX}${betRowId}:${side}`);
    return raw ? (JSON.parse(raw) as number[]) : [];
  }
  catch {
    return [];
  }
}

/** [A8 可证实] bundle `_`：BETACCOUNT + BETCOUNT */
function markUsedAccount(accountId: number, betRowId: number, side: BetSide) {
  const key = `${BET_ACCOUNT_PREFIX}${betRowId}:${side}`;
  const list = readUsedAccounts(betRowId, side);
  if (!list.includes(accountId)) {
    list.push(accountId);
    sessionStorage.setItem(key, JSON.stringify(list));
  }
}

/** [A8 可证实] BETACCOUNT + BETCOUNT + lastOdds（`B`） */
/** odds 省略时对齐 A8 补单 `A(D,x,I)`：只记 BETACCOUNT + BETCOUNT */
export function markSuccessfulBet(
  account: PlatformAccount,
  betId: number,
  side: BetSide,
  odds?: number,
) {
  if (!account.accountId)
    return;
  markUsedAccount(account.accountId, betId, side);
  incrementBetCount(account.accountId, betId, side);
  if (odds !== undefined)
    setLastBetOdds(account.accountId, betId, side, odds);
}
