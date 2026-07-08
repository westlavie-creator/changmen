import type { BetFilterMatchContext } from "@/domain/betting/betFilters";
import type { BetOption } from "@/models/betOption";
import type { ViewBet, ViewMatch } from "@/models/match";
import type { PlatformAccount } from "@/models/platformAccount";
import {
  accountPassesMainBetFilter,

  explainMainBetAccountRejection,
} from "@/domain/betting/betFilters";

/** [changmen 扩展] 投注比例 9999 = 单边模式：本侧仅预检、不参与自动下单，对侧可单边真下注 */
export const SINGLE_LEG_RATE = 9999;

export function isSingleLegRateAtOdds(
  account: Pick<PlatformAccount, "rateConfig">,
  odds: number,
): boolean {
  if (!account.rateConfig?.length)
    return false;
  const row = account.rateConfig.find(
    r =>
      (r.minOdds === 0 || r.minOdds <= odds) && (r.maxOdds === 0 || r.maxOdds >= odds),
  );
  return (row?.rate ?? 1) === SINGLE_LEG_RATE;
}

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
  if (base)
    return base;
  if (isSingleLegRateAtOdds(account, leg.odds)) {
    return "比例 9999 单边模式（本侧仅预检不下，对侧可自动下单）";
  }
  return null;
}

export function explainMissingLegAccount(
  leg: BetOption,
  bet: ViewBet,
  match: ViewMatch,
  accounts: PlatformAccount[],
  excludeAccountIds: number[],
  matchStore: BetFilterMatchContext,
  implied?: number,
): string {
  const sameProvider = accounts.filter(acc => acc.provider === leg.type);
  if (!sameProvider.length)
    return `没有 ${leg.type} 账号`;

  const parts = sameProvider.map((acc) => {
    const label = acc.playerName || `#${acc.accountId}`;
    if (excludeAccountIds.includes(acc.accountId))
      return `${label}: noSameBet 已排除`;
    if (acc.maxOrder && acc.todayOrder && acc.todayOrder >= acc.maxOrder)
      return `${label}: 已达账号当日订单上限 ${acc.todayOrder}/${acc.maxOrder}`;
    const balance = acc.getBalance();
    if (balance === undefined)
      return `${label}: 余额尚未加载`;
    if (balance < leg.betMoney)
      return `${label}: 余额 ${Math.floor(balance)} < 本腿金额 ${Math.ceil(leg.betMoney)}`;
    return `${label}: ${explainArbAccountRejection(acc, bet, match, leg, matchStore, implied) ?? "未知过滤"}`;
  });

  return parts.join("；");
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
    if (excludeAccountIds.includes(acc.accountId))
      return false;
    if (acc.provider !== leg.type)
      return false;
    if (acc.maxOrder && acc.todayOrder && acc.todayOrder >= acc.maxOrder)
      return false;
    const bal = acc.getBalance();
    if (bal === undefined || bal < leg.betMoney)
      return false;
    if (!isSingleLegRateAtOdds(acc, leg.odds))
      return false;
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
  if (betBothLegs)
    return false;
  return (
    (!accountA
      && legHasSingleLegRateAccount(legA, bet, match, accounts, excludeA, matchStore, implied))
    || (!accountB
      && legHasSingleLegRateAccount(legB, bet, match, accounts, excludeB, matchStore, implied))
  );
}

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
  missingAReason?: string;
  missingBReason?: string;
}): string {
  const {
    betBothLegs,
    singleLegByRate,
    accountA,
    accountB,
    legA,
    legB,
    missingAReason,
    missingBReason,
  } = params;
  if (betBothLegs || singleLegByRate)
    return "不满足下单条件";
  if (accountA && !accountB) {
    return `仅 ${legA.type} 有可用账号，缺 ${legB.type}，且该侧非比例 9999 单边模式${missingBReason ? `（${missingBReason}）` : ""}`;
  }
  if (accountB && !accountA) {
    return `仅 ${legB.type} 有可用账号，缺 ${legA.type}，且该侧非比例 9999 单边模式${missingAReason ? `（${missingAReason}）` : ""}`;
  }
  const reasons = [missingAReason, missingBReason].filter(Boolean).join("；");
  return `双腿均无可用账号${reasons ? `（${reasons}）` : ""}`;
}

/** 比例 9999 单边用负数 link；双腿套利为正时间戳 */
export function createArbLinkId(singleLegByRate = false, linkTs = Date.now()): number {
  return singleLegByRate ? -linkTs : linkTs;
}

/** 9999 单边：无下单账号的一侧用 9999 账号参与预检（可关） */
export function resolveSingleLegCheckAccounts(params: {
  singleLegByRate: boolean;
  precheck9999Leg?: boolean;
  accountA?: PlatformAccount;
  accountB?: PlatformAccount;
  legA: BetOption;
  legB: BetOption;
  bet: ViewBet;
  match: ViewMatch;
  accounts: PlatformAccount[];
  excludeA: number[];
  excludeB: number[];
  matchStore: BetFilterMatchContext;
  implied: number;
}): { checkAccountA?: PlatformAccount; checkAccountB?: PlatformAccount } {
  const {
    singleLegByRate,
    precheck9999Leg = true,
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
  let checkAccountA = accountA;
  let checkAccountB = accountB;
  if (!singleLegByRate || !precheck9999Leg)
    return { checkAccountA, checkAccountB };
  if (!accountA) {
    checkAccountA = findSingleLegRateAccount(
      legA,
      bet,
      match,
      accounts,
      excludeA,
      matchStore,
      implied,
    );
  }
  if (!accountB) {
    checkAccountB = findSingleLegRateAccount(
      legB,
      bet,
      match,
      accounts,
      excludeB,
      matchStore,
      implied,
    );
  }
  return { checkAccountA, checkAccountB };
}

export function isSingleLegPrecheckOnly(
  side: "A" | "B",
  accountA?: PlatformAccount,
  accountB?: PlatformAccount,
  checkAccountA?: PlatformAccount,
  checkAccountB?: PlatformAccount,
): boolean {
  if (side === "A")
    return Boolean(checkAccountA && !accountA);
  return Boolean(checkAccountB && !accountB);
}
