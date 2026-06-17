import { BetOption } from "@/models/betOption";
import type { ViewBet, ViewMatch } from "@/models/match";
import type { PlatformAccount } from "@/models/platformAccount";
import { isA8StrictMode } from "@/shared/a8Strict";
import {
  accountPassesMainBetFilter,
  explainMainBetAccountRejection,
  type BetFilterMatchContext,
} from "@/stores/betting/betFilters";

/** [changmen 扩展] rateConfig.rate === 9999 表示该赔率区间不参与自动选号（非 A8 语义） */
export const RATE_SKIP = 9999;

export function isRateSkipAtOdds(
  account: Pick<PlatformAccount, "rateConfig">,
  odds: number,
): boolean {
  if (!account.rateConfig?.length) return false;
  const row = account.rateConfig.find(
    (r) =>
      (r.minOdds === 0 || r.minOdds <= odds) && (r.maxOdds === 0 || r.maxOdds >= odds),
  );
  return (row?.rate ?? 1) === RATE_SKIP;
}

/** [changmen 扩展] 自动套利选号：增强模式排除 9999；严格模式与 A8 主过滤一致 */
export function arbAccountPickerFilter(
  account: PlatformAccount,
  bet: ViewBet,
  match: ViewMatch,
  leg: BetOption,
  matchStore: BetFilterMatchContext,
  implied?: number,
): boolean {
  if (!accountPassesMainBetFilter(account, bet, match, leg, matchStore, implied)) {
    return false;
  }
  if (isA8StrictMode()) return true;
  return !isRateSkipAtOdds(account, leg.odds);
}

export function explainArbAccountRejection(
  account: PlatformAccount,
  bet: ViewBet,
  match: ViewMatch,
  leg: BetOption,
  matchStore: BetFilterMatchContext,
  implied?: number,
): string | null {
  const base = explainMainBetAccountRejection(
    account,
    bet,
    match,
    leg,
    matchStore,
    implied,
  );
  if (base) return base;
  if (!isA8StrictMode() && isRateSkipAtOdds(account, leg.odds)) {
    return "投注比例 9999 跳过该赔率";
  }
  return null;
}

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
    return accountPassesMainBetFilter(acc, bet, match, leg, matchStore, implied);
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

/** 执行被 allowArbBetExecution 拒绝时的可读原因 */
export function explainAllowArbRejection(params: {
  betBothLegs: boolean;
  rate9999SingleLeg: boolean;
  accountA?: PlatformAccount;
  accountB?: PlatformAccount;
  legA: BetOption;
  legB: BetOption;
}): string {
  const { betBothLegs, rate9999SingleLeg, accountA, accountB, legA, legB } = params;
  if (betBothLegs || rate9999SingleLeg) return "不满足下单条件";
  if (accountA && !accountB) {
    return `仅 ${legA.type} 有可用账号，缺 ${legB.type}，且该侧非比例9999单边`;
  }
  if (accountB && !accountA) {
    return `仅 ${legB.type} 有可用账号，缺 ${legA.type}，且该侧非比例9999单边`;
  }
  return "双腿均无可用账号";
}

/** 仅比例 9999 单边用负数 link（展示 gb{时间戳}）；双腿对齐 A8 `Date.now()` */
export function createArbLinkId(rate9999SingleLeg = false): number {
  const ts = Date.now();
  return rate9999SingleLeg ? -ts : ts;
}
