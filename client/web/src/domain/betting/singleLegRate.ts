import { BetOption } from "@/models/betOption";
import type { ViewBet, ViewMatch } from "@/models/match";
import type { PlatformAccount } from "@/models/platformAccount";
import {
  accountPassesMainBetFilter,
  explainMainBetAccountRejection,
  type BetFilterMatchContext,
} from "@/domain/betting/betFilters";

/** [changmen 扩展] 投注比例 9999 = 单边模式：本侧不参与自动下单，对侧可单边真下注 */
export const SINGLE_LEG_RATE = 9999;

/** @deprecated 使用 SINGLE_LEG_RATE */
export const RATE_SKIP = SINGLE_LEG_RATE;

export function isSingleLegRateAtOdds(
  account: Pick<PlatformAccount, "rateConfig">,
  odds: number,
): boolean {
  if (!account.rateConfig?.length) return false;
  const row = account.rateConfig.find(
    (r) =>
      (r.minOdds === 0 || r.minOdds <= odds) && (r.maxOdds === 0 || r.maxOdds >= odds),
  );
  return (row?.rate ?? 1) === SINGLE_LEG_RATE;
}

/** @deprecated 使用 isSingleLegRateAtOdds */
export const isRateSkipAtOdds = isSingleLegRateAtOdds;

/** 自动套利选号：单边模式账号不参与本侧选号 */
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
  return !isSingleLegRateAtOdds(account, leg.odds);
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
  if (isSingleLegRateAtOdds(account, leg.odds)) {
    return "比例 9999 单边模式（本侧不下，对侧可自动下单）";
  }
  return null;
}

/** 该腿无 live 账号，但存在比例 9999 单边模式账号 */
export function legHasSingleLegRateAccount(
  leg: BetOption,
  bet: ViewBet,
  match: ViewMatch,
  accounts: PlatformAccount[],
  excludeAccountIds: number[],
  matchStore: BetFilterMatchContext,
  implied?: number,
): boolean {
  return findSingleLegRateAccount(
    leg,
    bet,
    match,
    accounts,
    excludeAccountIds,
    matchStore,
    implied,
  ) != null;
}

/** @deprecated 使用 legHasSingleLegRateAccount */
export const isLegSkippedByRate9999 = legHasSingleLegRateAccount;

/** 取该腿首个比例 9999 账号（Telegram 展示对侧不下单时用） */
export function findSingleLegRateAccount(
  leg: BetOption,
  bet: ViewBet,
  match: ViewMatch,
  accounts: PlatformAccount[],
  excludeAccountIds: number[],
  matchStore: BetFilterMatchContext,
  implied?: number,
): PlatformAccount | undefined {
  return accounts.find((acc) => {
    if (excludeAccountIds.includes(acc.accountId)) return false;
    if (acc.provider !== leg.type) return false;
    if (acc.maxOrder && acc.todayOrder && acc.todayOrder >= acc.maxOrder) return false;
    const bal = acc.getBalance();
    if (bal === undefined || bal < leg.betMoney) return false;
    if (!isSingleLegRateAtOdds(acc, leg.odds)) return false;
    return accountPassesMainBetFilter(acc, bet, match, leg, matchStore, implied);
  });
}

export function resolveSingleLegByRate(params: {
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
  if (betBothLegs) return false;
  return (
    (!accountA &&
      legHasSingleLegRateAccount(legA, bet, match, accounts, excludeA, matchStore, implied)) ||
    (!accountB &&
      legHasSingleLegRateAccount(legB, bet, match, accounts, excludeB, matchStore, implied))
  );
}

/** @deprecated 使用 resolveSingleLegByRate */
export const resolveRate9999SingleLeg = resolveSingleLegByRate;

/** 双腿均有 live 账号，或比例 9999 触发的单边模式 */
export function allowArbBetExecution(betBothLegs: boolean, singleLegByRate: boolean): boolean {
  return betBothLegs || singleLegByRate;
}

export function explainAllowArbRejection(params: {
  betBothLegs: boolean;
  singleLegByRate: boolean;
  accountA?: PlatformAccount;
  accountB?: PlatformAccount;
  legA: BetOption;
  legB: BetOption;
}): string {
  const { betBothLegs, singleLegByRate, accountA, accountB, legA, legB } = params;
  if (betBothLegs || singleLegByRate) return "不满足下单条件";
  if (accountA && !accountB) {
    return `仅 ${legA.type} 有可用账号，缺 ${legB.type}，且该侧非比例 9999 单边模式`;
  }
  if (accountB && !accountA) {
    return `仅 ${legB.type} 有可用账号，缺 ${legA.type}，且该侧非比例 9999 单边模式`;
  }
  return "双腿均无可用账号";
}

/** 比例 9999 单边用负数 link（展示 gb{时间戳}）；双腿套利为正时间戳 */
export function createArbLinkId(singleLegByRate = false, linkTs = Date.now()): number {
  return singleLegByRate ? -linkTs : linkTs;
}
