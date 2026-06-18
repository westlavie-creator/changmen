import type { PlatformId } from "@/types/esport";
import { useOddsStore } from "@/stores/oddsStore";
import {
  buildPlatformBetLookup,
  platformBetLookupKey,
  type PlatformBetLookupKey,
} from "@/stores/betting/kakaxi/matchBetLookup";
import type { ViewMatch } from "@/models/match";

type OddFlashKey = `${PlatformId}:${string}`;

let cachedLookup: Map<PlatformBetLookupKey, string> | null = null;
let cachedOddToBetId: Map<OddFlashKey, string> | null = null;
let cachedMatches: ViewMatch[] | null = null;

function buildOddToPlatformBetIdIndex(): Map<OddFlashKey, string> {
  const oddsStore = useOddsStore();
  const map = new Map<OddFlashKey, string>();
  for (const [platform, idx] of oddsStore.betIndex) {
    for (const [betId, odds] of idx) {
      for (const oddId of odds) {
        map.set(`${platform}:${oddId}`, betId);
      }
    }
  }
  return map;
}

export function invalidatePlatformBetLookupCache(): void {
  cachedLookup = null;
  cachedOddToBetId = null;
  cachedMatches = null;
}

/** 复用 match 列表未变时的 lookup + odd 反查索引 */
export function getPlatformBetLookup(matches: ViewMatch[]): Map<PlatformBetLookupKey, string> {
  if (cachedMatches === matches && cachedLookup && cachedOddToBetId) {
    return cachedLookup;
  }
  cachedMatches = matches;
  cachedLookup = buildPlatformBetLookup(matches);
  cachedOddToBetId = buildOddToPlatformBetIdIndex();
  return cachedLookup;
}

/** 从 fo.flash 反查受赔率波动影响的聚合盘口锚点 matchId:betId */
export function collectDirtyBetAnchorsFromFlash(
  matches: ViewMatch[],
): Set<string> {
  const oddsStore = useOddsStore();
  const lookup = getPlatformBetLookup(matches);
  const oddIndex = cachedOddToBetId ?? new Map<OddFlashKey, string>();
  const anchors = new Set<string>();
  const now = Date.now();

  for (const [flashKey, row] of oddsStore.flash) {
    if (row.until < now) continue;
    const sep = flashKey.indexOf(":");
    if (sep <= 0) continue;
    const platform = flashKey.slice(0, sep) as PlatformId;
    const oddId = flashKey.slice(sep + 1);
    const platformBetId = oddIndex.get(`${platform}:${oddId}`);
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
