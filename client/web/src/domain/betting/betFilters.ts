import { BetOption } from "@/models/betOption";
import type { BetSide, ViewBet, ViewMatch } from "@/models/match";
import type { PlatformAccount } from "@/models/platformAccount";
import {
  passesLastOddsGate,
  passesMaxBetCount,
} from "@/shared/betTiming";
import type { PlatformId } from "@/types/esport";

/** 下注过滤：操盘目标 + 可选初赔查询（缺省时视为无初赔约束） */
export interface BetFilterMatchContext {
  getBetTarget: (provider: PlatformId, betId: number) => BetSide | undefined;
  getDefaultOdds?: (betId: number, side: BetSide) => number | undefined;
}

function resolveDefaultOdds(
  matchStore: BetFilterMatchContext,
  betId: number,
  side: BetSide,
): number | undefined {
  return matchStore.getDefaultOdds?.(betId, side);
}

/** 对齐 bundle：账号 minDefault / maxDefault 与初赔比较（纯函数） */
export function passesDefaultOddsAt(
  account: PlatformAccount,
  defaultOdds: number | undefined,
): boolean {
  const def = defaultOdds;
  if (!def) return true;
  if (account.minDefault && def < account.minDefault) return false;
  if (account.maxDefault && def > account.maxDefault) return false;
  return true;
}

/** [changmen 扩展] 比例 9999 单边模式见 domain/betting/singleLegRate */
export function accountPassesMainBetFilter(
  account: PlatformAccount,
  bet: ViewBet,
  match: ViewMatch,
  leg: BetOption,
  matchStore: BetFilterMatchContext,
  _implied?: number,
): boolean {
  if (account.isPause() || account.markupOnly) return false;
  if (!account.checkOdds(leg.odds, match.gameId)) return false;
  if (!passesDefaultOddsAt(account, resolveDefaultOdds(matchStore, bet.id, leg.target))) {
    return false;
  }
  if (!passesLastOddsGate(account, bet.id, leg.target, leg.odds)) return false;
  if (!passesMaxBetCount(account, bet.id, leg.target)) return false;
  const target = matchStore.getBetTarget(account.provider, bet.id);
  if (target && target !== leg.target) return false;
  return true;
}

/** 主腿账号未通过时的人类可读原因（A8 对齐；9999 见 explainArbAccountRejection） */
export function explainMainBetAccountRejection(
  account: PlatformAccount,
  bet: ViewBet,
  match: ViewMatch,
  leg: BetOption,
  matchStore: BetFilterMatchContext,
  _implied?: number,
): string | null {
  const pause = account.isPause();
  if (pause) return pause;
  if (account.markupOnly) return "仅限补单账号";
  if (!account.checkOdds(leg.odds, match.gameId)) {
    return `赔率 ${leg.odds} 不在账号区间 ${account.getMinOdds()}~${account.getMaxOdds()}`;
  }
  if (!passesDefaultOddsAt(account, resolveDefaultOdds(matchStore, bet.id, leg.target))) {
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
