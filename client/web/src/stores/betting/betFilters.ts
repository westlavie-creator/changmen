import { BetOption } from "@/models/betOption";
import type { BetSide, ViewBet, ViewMatch } from "@/models/match";
import type { PlatformAccount } from "@/models/platformAccount";
import { isRateSkipAtOdds } from "@/models/platformAccount";
import {
  passesLastOddsGate,
  passesMaxBetCount,
} from "@/shared/betTiming";
import { useMatchStore } from "@/stores/matchStore";
import type { PlatformId } from "@/types/esport";

/** 下注过滤仅需 match store 的操盘目标查询 */
export interface BetFilterMatchContext {
  getBetTarget: (provider: PlatformId, betId: number) => BetSide | undefined;
}

/** 对齐 bundle：账号 minDefault / maxDefault 与初赔比较 */
export function passesDefaultOddsAccount(
  account: PlatformAccount,
  betId: number,
  side: BetSide,
): boolean {
  const def = useMatchStore().getDefaultOdds(betId, side);
  if (!def) return true;
  if (account.minDefault && def < account.minDefault) return false;
  if (account.maxDefault && def > account.maxDefault) return false;
  return true;
}

/** 与 accountPassesMainBetFilter 相同，但不排除比例 9999 */
export function accountPassesMainBetFilterExceptRate(
  account: PlatformAccount,
  bet: ViewBet,
  match: ViewMatch,
  leg: BetOption,
  matchStore: BetFilterMatchContext,
  implied?: number,
): boolean {
  if (account.isPause() || account.markupOnly) return false;
  if (!account.checkOdds(leg.odds, match.gameId)) return false;
  if (!account.passesGameSettings(match.game, leg.odds, implied)) return false;
  if (!passesDefaultOddsAccount(account, bet.id, leg.target)) return false;
  if (!passesLastOddsGate(account, bet.id, leg.target, leg.odds)) return false;
  if (!passesMaxBetCount(account, bet.id, leg.target)) return false;
  const target = matchStore.getBetTarget(account.provider, bet.id);
  if (target && target !== leg.target) return false;
  return true;
}

export function accountPassesMainBetFilter(
  account: PlatformAccount,
  bet: ViewBet,
  match: ViewMatch,
  leg: BetOption,
  matchStore: BetFilterMatchContext,
  implied?: number,
): boolean {
  if (!account.canBetAtOdds(leg.odds)) return false;
  return accountPassesMainBetFilterExceptRate(
    account,
    bet,
    match,
    leg,
    matchStore,
    implied,
  );
}

/** 主腿账号未通过时的人类可读原因（用于套利提醒 / UI） */
export function explainMainBetAccountRejection(
  account: PlatformAccount,
  bet: ViewBet,
  match: ViewMatch,
  leg: BetOption,
  matchStore: BetFilterMatchContext,
  implied?: number,
): string | null {
  if (!account.canBetAtOdds(leg.odds)) {
    return "投注比例 9999 跳过该赔率";
  }
  const pause = account.isPause();
  if (pause) return pause;
  if (account.markupOnly) return "仅限补单账号";
  if (!account.checkOdds(leg.odds, match.gameId)) {
    return `赔率 ${leg.odds} 不在账号区间 ${account.getMinOdds()}~${account.getMaxOdds()}`;
  }
  if (!account.passesGameSettings(match.game, leg.odds, implied)) {
    return `游戏「${match.game}」配置不满足（利润/次数/赔率区间）`;
  }
  if (!passesDefaultOddsAccount(account, bet.id, leg.target)) {
    return "初赔不在账号设定区间";
  }
  if (!passesLastOddsGate(account, bet.id, leg.target, leg.odds)) {
    return "赔率不大于上笔成功单";
  }
  if (!passesMaxBetCount(account, bet.id, leg.target)) {
    return "已达同场同边盘口订单上限";
  }
  const target = matchStore.getBetTarget(account.provider, bet.id);
  if (target && target !== leg.target) {
    return `操盘目标为 ${target === "Home" ? "主" : "客"}，与当前腿不一致`;
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
