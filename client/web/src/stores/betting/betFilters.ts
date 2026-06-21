import type { BetFilterMatchContext } from "@/domain/betting/betFilters";
import type { BetSide } from "@/models/match";
import type { PlatformAccount } from "@/models/platformAccount";
import {
  accountPassesMainBetFilter,

  explainMainBetAccountRejection,
  passesDefaultOddsAt,
  passesMakeUpAccountFilter,
} from "@/domain/betting/betFilters";
import { useMatchStore } from "@/stores/matchStore";

export type { BetFilterMatchContext };
export {
  accountPassesMainBetFilter,
  explainMainBetAccountRejection,
  passesDefaultOddsAt,
  passesMakeUpAccountFilter,
};

/** 对齐 bundle：账号 minDefault / maxDefault 与初赔比较（经 matchStore 取初赔） */
export function passesDefaultOddsAccount(
  account: PlatformAccount,
  betId: number,
  side: BetSide,
): boolean {
  return passesDefaultOddsAt(account, useMatchStore().getDefaultOdds(betId, side));
}

/** jb 补单选账号 filter（经 matchStore 取初赔） */
export function passesMakeUpAccount(
  account: PlatformAccount,
  sideOdds: number,
  betId: number,
  side: BetSide,
): boolean {
  const matchStore = useMatchStore();
  return passesMakeUpAccountFilter(account, sideOdds, betId, side, {
    getBetTarget: matchStore.getBetTarget.bind(matchStore),
    getDefaultOdds: matchStore.getDefaultOdds.bind(matchStore),
  });
}
