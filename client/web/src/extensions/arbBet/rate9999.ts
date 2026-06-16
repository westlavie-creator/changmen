import { BetOption } from "@/models/betOption";
import type { ViewBet, ViewMatch } from "@/models/match";
import type { PlatformAccount } from "@/models/platformAccount";
import { isRateSkipAtOdds } from "@/models/platformAccount";
import { isA8StrictMode } from "@/shared/a8Strict";
import {
  accountPassesMainBetFilterExceptRate,
  type BetFilterMatchContext,
} from "@/stores/betting/betFilters";

/** 该腿无可用账号，但存在仅因比例 9999 被排除的候选（changmen 单边负 linkId 场景） */
export function isLegSkippedByRate9999(
  leg: BetOption,
  bet: ViewBet,
  match: ViewMatch,
  accounts: PlatformAccount[],
  excludeAccountIds: number[],
  matchStore: BetFilterMatchContext,
  implied?: number,
): boolean {
  return accounts.some((acc) => {
    if (excludeAccountIds.includes(acc.accountId)) return false;
    if (acc.provider !== leg.type) return false;
    if (acc.maxOrder && acc.todayOrder && acc.todayOrder >= acc.maxOrder) return false;
    const bal = acc.getBalance();
    if (bal === undefined || bal < leg.betMoney) return false;
    if (!isRateSkipAtOdds(acc, leg.odds)) return false;
    return accountPassesMainBetFilterExceptRate(
      acc,
      bet,
      match,
      leg,
      matchStore,
      implied,
    );
  });
}

export function resolveRate9999SingleLeg(params: {
  betBothLegs: boolean;
  accountA: PlatformAccount | undefined;
  accountB: PlatformAccount | undefined;
  legA: BetOption;
  legB: BetOption;
  bet: ViewBet;
  match: ViewMatch;
  accounts: PlatformAccount[];
  excludeA: number[];
  excludeB: number[];
  matchStore: BetFilterMatchContext;
  implied: number;
}): boolean {
  const {
    betBothLegs,
    accountA,
    accountB,
    legA,
    legB,
    bet,
    match,
    accounts,
    excludeA,
    excludeB,
    matchStore,
    implied,
  } = params;
  if (isA8StrictMode()) return false;
  if (betBothLegs) return false;
  return (
    (!accountA &&
      isLegSkippedByRate9999(legA, bet, match, accounts, excludeA, matchStore, implied)) ||
    (!accountB &&
      isLegSkippedByRate9999(legB, bet, match, accounts, excludeB, matchStore, implied))
  );
}

/** [A8 可证实] `if (!be || !Z) continue`；[changmen 扩展] 或 rate9999 单边 */
export function allowArbBetExecution(betBothLegs: boolean, rate9999SingleLeg: boolean): boolean {
  return betBothLegs || rate9999SingleLeg;
}

/** 仅比例 9999 单边用负数 link（展示 gb{时间戳}）；双腿对齐 A8 `Date.now()` */
export function createArbLinkId(rate9999SingleLeg = false): number {
  const ts = Date.now();
  return rate9999SingleLeg ? -ts : ts;
}
