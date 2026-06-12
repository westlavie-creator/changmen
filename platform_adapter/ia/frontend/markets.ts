import type { CollectBetDto } from "@/types/collect";
import type { CollectPlatformInfo } from "@/types/esport";
import { PLATFORMS } from "@/shared/platform";
import { useOddsStore } from "@/stores/oddsStore";
import {
  buildIaSaveBetRowsFromPlays,
  isIaChildCollectable,
  listIaChildFoOddEntries,
} from "../shared/save_bets";
import { betKeyFromChild, iaChildLocked } from "../shared/parse_fields";
import { iaCollectPost } from "./transport";

const PLATFORM = PLATFORMS.IA;

/** Ingest：可采集 child 写入 fo */
function ingestIaPlaysToFo(
  plays: Array<Record<string, unknown>>,
  betRe: RegExp,
): void {
  const odds = useOddsStore();
  const now = Date.now();
  for (const play of plays) {
    const children = (play.child_plays ?? []) as Array<Record<string, unknown>>;
    for (const child of children) {
      const betKey = betKeyFromChild(child);
      if (!isIaChildCollectable(child, betKey, betRe)) continue;
      const points = (child.team_points ?? []) as Array<Record<string, unknown>>;
      const locked = iaChildLocked(child, points[0], points[1]);
      for (const entry of listIaChildFoOddEntries(child, locked)) {
        odds.save(
          PLATFORM,
          {
            id: entry.id,
            odds: entry.odds,
            isLock: entry.isLock,
            betId: entry.betId,
            time: now,
          },
          "http",
        );
      }
    }
  }
}

/** Report：plays 快照 → SaveBet 行 */
function reportIaPlaysToSaveBetRows(
  plays: Array<Record<string, unknown>>,
  matchId: string,
  betRe: RegExp,
): CollectBetDto[] {
  return buildIaSaveBetRowsFromPlays(plays, matchId, betRe, PLATFORM);
}

/** 单场 getPointsListSplit：Ingest fo + 返回 Report 载荷 */
export async function loadIaBets(
  platform: CollectPlatformInfo,
  matchId: string,
  betRe: RegExp,
): Promise<CollectBetDto[]> {
  const res = await iaCollectPost<{ code?: number; data?: { plays?: Array<Record<string, unknown>> } }>(
    platform,
    "/api/game/game/getPointsListSplit",
    { game_id: matchId, lang: 1 },
  );
  if (res.code !== undefined && res.code !== 1) return [];

  const plays = res.data?.plays ?? [];
  ingestIaPlaysToFo(plays, betRe);
  return reportIaPlaysToSaveBetRows(plays, matchId, betRe);
}
