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

  return {
    categoryId,
    homeMarketId: String(entry.homeMarketId),
    awayMarketId: String(entry.awayMarketId),
    homeTokenId,
    awayTokenId,
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
    bet: {
      Type: "PredictFun",
      SourceMatchID: sourceMatchId,
      SourceBetID: String(entry.sourceBetId || categoryId),
      Map: 0,
      BetName: "Match Winner",
      SourceHomeID: homeTokenId,
      HomeName: homeName,
      HomeOdds: homeOdds,
      SourceAwayID: awayTokenId,
      AwayName: awayName,
      AwayOdds: awayOdds,
      Status: status,
    },
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
    const mapped = indexEntryToMappedMarket(entry);
    maps.marketsByCategory.set(mapped.categoryId, mapped);
    maps.marketIdToCategory.set(mapped.homeMarketId, mapped.categoryId);
    maps.marketIdToCategory.set(mapped.awayMarketId, mapped.categoryId);
  }

  return [...new Set((index.marketIds ?? []).map(String).filter(Boolean))];
}

export function mappedBetFromIndex(entry: PredictFunMarketIndexEntry): CollectBetDto {
  return indexEntryToMappedMarket(entry).bet;
}
