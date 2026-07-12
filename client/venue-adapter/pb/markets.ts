import { saveVenueOdds } from "@changmen/client-core/bridge/oddsAccess";
import type { CollectBetDto, CollectMatchDto } from "@changmen/client-core/types/collect";
import { PLATFORMS } from "@changmen/venue-adapter/shared/platforms";

import { setPbLineId } from "./lineCache";
import { pbTeamLogo, type PbParsedMatch } from "./parse";
import {
  buildPbSaveBetRowsFromMatch,
  listPbStageFoEntries,
} from "./shared/save_bets";

const PLATFORM = PLATFORMS.PB;

/** Ingest：parse 后的单场 → fo + lineId 缓存 */
export function ingestPbParsedMatchToFo(row: PbParsedMatch, now = Date.now()): void {
  for (const stage of row.stages) {
    if (stage.winLineId) setPbLineId(stage.winMarketId, stage.winLineId);
    for (const entry of listPbStageFoEntries(stage)) {
      saveVenueOdds(PLATFORM, { ...entry, time: now });
    }
  }
}

export function buildPbCollectMatchDto(row: PbParsedMatch): CollectMatchDto {
  return {
    Type: PLATFORM,
    SourceMatchID: row.matchId,
    SourceGameID: row.gameId,
    BO: row.bo,
    StartTime: row.startTime,
    Home: row.home.name,
    HomeID: row.home.id,
    Away: row.away.name,
    AwayID: row.away.id,
    Teams: [
      {
        Type: PLATFORM,
        GameID: row.gameId,
        Name: row.home.name,
        TeamID: row.home.id,
        Logo: pbTeamLogo(row.gameId, row.home.englishName),
      },
      {
        Type: PLATFORM,
        GameID: row.gameId,
        Name: row.away.name,
        TeamID: row.away.id,
        Logo: pbTeamLogo(row.gameId, row.away.englishName),
      },
    ],
  };
}

/** Report：parse 后的单场 → SaveBet 行 */
export function buildPbSaveBetRowsFromParsedMatch(row: PbParsedMatch): CollectBetDto[] {
  return buildPbSaveBetRowsFromMatch(row, PLATFORM) as CollectBetDto[];
}

/** Ingest fo + 返回 match / bets 载荷（collect 轮询用） */
export function ingestAndReportPbParsedMatch(
  row: PbParsedMatch,
  now = Date.now(),
): { match: CollectMatchDto; bets: CollectBetDto[] } {
  ingestPbParsedMatchToFo(row, now);
  return {
    match: buildPbCollectMatchDto(row),
    bets: buildPbSaveBetRowsFromParsedMatch(row),
  };
}
