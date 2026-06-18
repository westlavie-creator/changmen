import type { ViewMatch } from "@/models/match";
import type { PlatformId } from "@/types/esport";
import { betAnchor } from "@/extensions/arbOpportunity/types";

/** platform 侧盘口 id（Sources.BetID）→ 聚合 ViewBet */
export type PlatformBetLookupKey = `${PlatformId}:${string}`;

export function platformBetLookupKey(
  platform: PlatformId,
  platformBetId: string,
): PlatformBetLookupKey {
  return `${platform}:${platformBetId}`;
}

/** 由 matchStore 构建：platform:platformBetId → matchId:betId */
export function buildPlatformBetLookup(matches: ViewMatch[]): Map<PlatformBetLookupKey, string> {
  const map = new Map<PlatformBetLookupKey, string>();
  for (const match of matches) {
    for (const bet of match.bets) {
      const anchor = betAnchor({ matchId: match.id, betId: bet.id });
      for (const item of bet.items) {
        map.set(platformBetLookupKey(item.type, item.betId), anchor);
      }
    }
  }
  return map;
}
