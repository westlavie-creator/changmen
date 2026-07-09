import type { BetSide, ViewBet, ViewBetItem } from "@/models/match";
import { calcEdge, removVig } from "@/extensions/valueBet/evCalc";
import { MIN_EDGE, SHARP_PLATFORM, SOFT_PLATFORMS } from "@/extensions/valueBet/evConfig";
import type { PlatformId } from "@/types/esport";

export interface ValueBetEdgeSnapshot {
  softOdds: number;
  fairOdds: number;
  edge: number;
  sharpHome: number;
  sharpAway: number;
}

/** 相对 PB 重算单边 edge；不满足软庄/sharp 条件时返回 null */
export function computeValueBetEdge(
  bet: ViewBet,
  item: ViewBetItem,
  side: BetSide,
): ValueBetEdgeSnapshot | null {
  if (item.type === SHARP_PLATFORM)
    return null;
  if (!SOFT_PLATFORMS.includes(item.type as PlatformId))
    return null;

  const sharpItem = bet.items.find(it => it.type === SHARP_PLATFORM);
  if (!sharpItem)
    return null;

  const sharpHome = sharpItem.getOdds("Home");
  const sharpAway = sharpItem.getOdds("Away");
  if (!sharpHome || !sharpAway)
    return null;

  const fair = removVig(sharpHome, sharpAway);
  if (!fair)
    return null;

  const softOdds = item.getOdds(side);
  if (!softOdds)
    return null;

  const fairOdds = side === "Home" ? fair.fairHome : fair.fairAway;
  const edge = calcEdge(softOdds, fairOdds);
  return {
    softOdds,
    fairOdds,
    edge,
    sharpHome,
    sharpAway,
  };
}

export function isValueBetPositiveEdge(edge: number): boolean {
  return Number.isFinite(edge) && edge >= MIN_EDGE;
}
