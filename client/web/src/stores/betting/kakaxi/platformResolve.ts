import type { ViewBet, ViewMatch } from "@/models/match";
import type { PlatformAccount } from "@/models/platformAccount";
import type { KakaxiQueuedBet } from "@/stores/betting/kakaxi/types";
import type { PlatformId } from "@/types/esport";
import type { UserConfig } from "@/types/userConfig";
import { pickArbLegs } from "@/domain/arbitrage";

/** 队列条目上的平台腿（入队时来自 detect，缺失时由 pickArbLegs 补全） */
export function kakaxiQueuedBetPlatforms(item: KakaxiQueuedBet): PlatformId[] | undefined {
  if (item.homePlatform && item.awayPlatform) {
    return [item.homePlatform, item.awayPlatform];
  }
  return undefined;
}

export function resolveKakaxiQueuedBetPlatforms(
  item: KakaxiQueuedBet,
  match: ViewMatch,
  bet: ViewBet,
  config: UserConfig,
  providerKeys: PlatformId[],
  accounts: PlatformAccount[],
): PlatformId[] | undefined {
  const stored = kakaxiQueuedBetPlatforms(item);
  if (stored)
    return stored;

  bet.items.forEach(row => row.updateOdds());
  const legs = pickArbLegs(bet, config, providerKeys, accounts, match.game);
  if (!legs)
    return undefined;
  return [legs.homeItem.type, legs.awayItem.type];
}

export function platformsConflict(
  platforms: PlatformId[],
  busy: ReadonlySet<PlatformId>,
): boolean {
  return platforms.some(p => busy.has(p));
}
