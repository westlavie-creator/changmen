import type { PlatformId } from "@/types/esport";
import { useOddsStore } from "@/stores/oddsStore";
import {
  buildPlatformBetLookup,
  platformBetLookupKey,
  type PlatformBetLookupKey,
} from "@/stores/betting/kakaxi/matchBetLookup";
import type { ViewMatch } from "@/models/match";

function findPlatformBetIdForOdd(
  platform: PlatformId,
  oddId: string,
): string | undefined {
  const oddsStore = useOddsStore();
  const idx = oddsStore.betIndex.get(platform);
  if (!idx) return undefined;
  for (const [betId, odds] of idx) {
    if (odds.includes(oddId)) return betId;
  }
  return undefined;
}

/** 从 fo.flash 反查受赔率波动影响的聚合盘口锚点 matchId:betId */
export function collectDirtyBetAnchorsFromFlash(
  matches: ViewMatch[],
): Set<string> {
  const oddsStore = useOddsStore();
  const lookup = buildPlatformBetLookup(matches);
  const anchors = new Set<string>();
  const now = Date.now();

  for (const [flashKey, row] of oddsStore.flash) {
    if (row.until < now) continue;
    const sep = flashKey.indexOf(":");
    if (sep <= 0) continue;
    const platform = flashKey.slice(0, sep) as PlatformId;
    const oddId = flashKey.slice(sep + 1);
    const platformBetId = findPlatformBetIdForOdd(platform, oddId);
    if (!platformBetId) continue;
    const anchor = lookup.get(platformBetLookupKey(platform, platformBetId));
    if (anchor) anchors.add(anchor);
  }

  return anchors;
}

export function shouldRunFullKakaxiDetect(
  mode: "incremental" | "full",
  dirtyAnchors: Set<string>,
): boolean {
  if (mode === "full") return true;
  return dirtyAnchors.size > 0;
}
