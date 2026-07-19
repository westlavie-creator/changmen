import type { PredictFunMarketIndex, PredictFunMarketIndexEntry } from "@changmen/api-contract";
import type { CollectBetDto } from "@changmen/client-core/types/collect";

import type { PredictMappedMarket } from "./parse";

export function isPredictFunMarketIndex(value: unknown): value is PredictFunMarketIndex {
  if (!value || typeof value !== "object")
    return false;
  const row = value as PredictFunMarketIndex;
  return Array.isArray(row.entries) && Array.isArray(row.marketIds);
}

export function indexEntryToMappedMarket(entry: PredictFunMarketIndexEntry): PredictMappedMarket {
  const sourceMatchId = String(entry.sourceMatchId);
  const categoryId = String(entry.categoryId);
  const homeName = String(entry.homeName);
  const awayName = String(entry.awayName);
  const homeTokenId = String(entry.homeTokenId);
  const awayTokenId = String(entry.awayTokenId);
  const homeOdds = Number(entry.homeOdds) || 0;
  const awayOdds = Number(entry.awayOdds) || 0;
  const status = String(entry.status ?? "Locked");
  const mapNum = Number(entry.map) || 0;
  const homeMarketId = String(entry.homeMarketId);
  const awayMarketId = String(entry.awayMarketId);
  const bet: CollectBetDto = {
    Type: "PredictFun",
    SourceMatchID: sourceMatchId,
    SourceBetID: String(entry.sourceBetId || categoryId),
    Map: mapNum,
    BetName: mapNum > 0 ? `Game ${mapNum} Winner` : "Match Winner",
    SourceHomeID: homeTokenId,
    HomeName: homeName,
    HomeOdds: homeOdds,
    SourceAwayID: awayTokenId,
    AwayName: awayName,
    AwayOdds: awayOdds,
    Status: status,
  };

  return {
    categoryId,
    homeMarketId,
    awayMarketId,
    homeTokenId,
    awayTokenId,
    marketIds: [...new Set([homeMarketId, awayMarketId].filter(Boolean))],
    match: {
      Type: "PredictFun",
      SourceMatchID: sourceMatchId,
      SourceGameID: "",
      StartTime: 0,
      HomeID: "",
      Home: homeName,
      AwayID: "",
      Away: awayName,
      Teams: [],
    },
    bet,
    bets: [bet],
  };
}

export function applyPredictFunMarketIndex(
  index: PredictFunMarketIndex | null | undefined,
  maps: {
    marketsByCategory: Map<string, PredictMappedMarket>;
    marketIdToCategory: Map<string, string>;
  },
): string[] {
  maps.marketsByCategory.clear();
  maps.marketIdToCategory.clear();
  if (!index?.entries?.length)
    return [];

  for (const entry of index.entries) {
    const categoryId = String(entry.categoryId);
    const mappedOne = indexEntryToMappedMarket(entry);
    const existing = maps.marketsByCategory.get(categoryId);
    if (!existing) {
      maps.marketsByCategory.set(categoryId, mappedOne);
    }
    else {
      existing.bets = [...(existing.bets || []), ...mappedOne.bets];
      existing.marketIds = [...new Set([
        ...(existing.marketIds || []),
        ...(mappedOne.marketIds || []),
      ])];
      if (Number(mappedOne.bet.Map) === 0)
        existing.bet = mappedOne.bet;
      // 全场 market id 优先挂在 mapped 顶层，便于旧逻辑
      if (Number(mappedOne.bet.Map) === 0) {
        existing.homeMarketId = mappedOne.homeMarketId;
        existing.awayMarketId = mappedOne.awayMarketId;
        existing.homeTokenId = mappedOne.homeTokenId;
        existing.awayTokenId = mappedOne.awayTokenId;
      }
    }
    if (mappedOne.homeMarketId)
      maps.marketIdToCategory.set(mappedOne.homeMarketId, categoryId);
    if (mappedOne.awayMarketId)
      maps.marketIdToCategory.set(mappedOne.awayMarketId, categoryId);
  }

  return [...new Set((index.marketIds ?? []).map(String).filter(Boolean))];
}

export function mappedBetFromIndex(entry: PredictFunMarketIndexEntry): CollectBetDto {
  return indexEntryToMappedMarket(entry).bet;
}
