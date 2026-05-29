import type { BetSide } from "@/models/match";
import type { PlatformAccount } from "@/models/platformAccount";

/** 对齐 bundle `B` / `$`：成功下单后记录赔率，lastOdds 开启时拒重复低赔 */
const lastOddsByKey = new Map<string, number>();

function lastOddsKey(accountId: number, betId: number, side: BetSide): string {
  return `${accountId}:${betId}:${side}`;
}

export function getLastBetOdds(
  accountId: number,
  betId: number,
  side: BetSide,
): number | undefined {
  return lastOddsByKey.get(lastOddsKey(accountId, betId, side));
}

export function setLastBetOdds(
  accountId: number,
  betId: number,
  side: BetSide,
  odds: number,
): void {
  lastOddsByKey.set(lastOddsKey(accountId, betId, side), odds);
}

export function passesLastOddsGate(
  account: PlatformAccount,
  betId: number,
  side: BetSide,
  currentOdds: number,
): boolean {
  if (!account.lastOdds) return true;
  const prev = getLastBetOdds(account.accountId, betId, side);
  if (prev != null && prev >= currentOdds) return false;
  return true;
}
