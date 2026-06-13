import { BetOption } from "@/models/betOption";
import type { BetSide, ViewBet, ViewMatch } from "@/models/match";
import type { PlatformAccount } from "@/models/platformAccount";
import {
  passesLastOddsGate,
  passesMaxBetCount,
} from "@/shared/bettingSession";
import { useMatchStore } from "@/stores/matchStore";

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

export function accountPassesMainBetFilter(
  account: PlatformAccount,
  bet: ViewBet,
  match: ViewMatch,
  leg: BetOption,
  matchStore: ReturnType<typeof useMatchStore>,
  implied?: number,
): boolean {
  if (account.isPause() || account.markupOnly) return false;
  if (!account.checkOdds(leg.odds, match.gameId)) return false;
  if (!account.passesGameSettings(match.game, leg.odds, implied)) return false;
  if (!passesDefaultOddsAccount(account, bet.id, leg.target)) return false;
  if (!passesLastOddsGate(account, bet.id, leg.target, leg.odds)) return false;
  if (!passesMaxBetCount(account, bet.id, leg.target)) return false;
  if (!account.canBetAtOdds(leg.odds)) return false;
  const target = matchStore.getBetTarget(account.provider, bet.id);
  if (target && target !== leg.target) return false;
  return true;
}
