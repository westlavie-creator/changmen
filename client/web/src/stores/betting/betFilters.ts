import type { BetSide } from "@/models/match";
import type { PlatformAccount } from "@/models/platformAccount";
import {
  accountPassesMainBetFilter,
  explainMainBetAccountRejection,
  passesDefaultOddsAt,
  type BetFilterMatchContext,
} from "@/domain/betting/betFilters";
import { useMatchStore } from "@/stores/matchStore";

export type { BetFilterMatchContext };
export { accountPassesMainBetFilter, explainMainBetAccountRejection, passesDefaultOddsAt };

/** 对齐 bundle：账号 minDefault / maxDefault 与初赔比较（经 matchStore 取初赔） */
export function passesDefaultOddsAccount(
  account: PlatformAccount,
  betId: number,
  side: BetSide,
): boolean {
  return passesDefaultOddsAt(account, useMatchStore().getDefaultOdds(betId, side));
}
