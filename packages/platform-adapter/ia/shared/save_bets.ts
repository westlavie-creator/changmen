import type { CollectBetDto } from "@/types/collect";
import type { PlatformId } from "@/types/esport";
import { PLATFORMS } from "@/shared/platform";
import { iaLegacyWinBetName } from "@changmen/shared/catalog/market_catalog.browser";
import { betKeyFromChild, iaChildLocked, iaPointLocked, parseIaPoint } from "./parse_fields";

/** ??market_catalog.mjs iaLegacyWinBetName ???????????????*/
export function iaMainWinBetKey(key: string): boolean {
  return iaLegacyWinBetName(key);
}

/** platform BetName + catalog ???? */
export function isIaChildCollectable(
  _child: Record<string, unknown>,
  betKey: string,
  betRe: RegExp,
): boolean {
  if (!betRe.test(betKey)) return false;
  return iaLegacyWinBetName(betKey);
}

/** child ??SaveBet ??*/
export function iaChildToSaveBetRow(
  child: Record<string, unknown>,
  matchId: string,
  betKey: string,
  platform: PlatformId = PLATFORMS.IA,
): CollectBetDto {
  const mapNum = Number(child.match) || 0;
  const playId = String(child.id ?? "");
  const points = (child.team_points ?? []) as Array<Record<string, unknown>>;
  const homePt = points[0];
  const awayPt = points[1];
  const locked = iaChildLocked(child, homePt, awayPt);

  return {
    Type: platform,
    SourceMatchID: matchId,
    SourceBetID: playId,
    Map: mapNum,
    BetName: betKey,
    SourceHomeID: homePt ? String(homePt.id) : "",
    HomeName: homePt ? String(homePt.name ?? "") : "",
    HomeOdds: parseIaPoint(homePt),
    SourceAwayID: awayPt ? String(awayPt.id) : "",
    AwayName: awayPt ? String(awayPt.name ?? "") : "",
    AwayOdds: parseIaPoint(awayPt),
    Status: locked ? "Locked" : "Normal",
  };
}

/** fo ?????Ingest ?? */
export function listIaChildFoOddEntries(
  child: Record<string, unknown>,
): Array<{ id: string; odds: number; isLock: boolean; betId: string }> {
  const playId = String(child.id ?? "");
  const points = (child.team_points ?? []) as Array<Record<string, unknown>>;
  const entries: Array<{ id: string; odds: number; isLock: boolean; betId: string }> = [];
  for (const pt of points.slice(0, 2)) {
    if (!pt?.id) continue;
    entries.push({
      id: String(pt.id),
      odds: parseIaPoint(pt),
      isLock: iaPointLocked(pt),
      betId: playId,
    });
  }
  return entries;
}

/** getPointsListSplit plays ??SaveBet ??Report ?? */
export function buildIaSaveBetRowsFromPlays(
  plays: Array<Record<string, unknown>>,
  matchId: string,
  betRe: RegExp,
  platform: PlatformId = PLATFORMS.IA,
): CollectBetDto[] {
  const bets: CollectBetDto[] = [];
  for (const play of plays) {
    const children = (play.child_plays ?? []) as Array<Record<string, unknown>>;
    for (const child of children) {
      const betKey = betKeyFromChild(child);
      if (!isIaChildCollectable(child, betKey, betRe)) continue;
      bets.push(iaChildToSaveBetRow(child, matchId, betKey, platform));
    }
  }
  return bets.sort((a, b) => a.Map - b.Map);
}
