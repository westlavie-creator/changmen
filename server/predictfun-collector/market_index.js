import { writePredictFunMarketIndex } from "@changmen/storage/predictfun_market_index.js";

/** @param {import("@changmen/api-contract").PredictFunMarketIndexEntry[]} entries */
export function buildPredictFunMarketIndexFromMapped(entries) {
  const marketIdSet = new Set();
  for (const row of entries) {
    if (row.homeMarketId)
      marketIdSet.add(row.homeMarketId);
    if (row.awayMarketId)
      marketIdSet.add(row.awayMarketId);
  }
  return {
    updatedAt: Date.now(),
    marketIds: [...marketIdSet],
    entries,
  };
}

/** @param {ReturnType<import("./parse.js").buildPredictMappedMarket>[]} candidates */
export function persistPredictFunMarketIndex(candidates) {
  const entries = candidates.map(mapped => ({
    sourceMatchId: String(mapped.match.SourceMatchID),
    categoryId: mapped.categoryId,
    homeMarketId: mapped.homeMarketId,
    awayMarketId: mapped.awayMarketId,
    homeTokenId: mapped.homeTokenId,
    awayTokenId: mapped.awayTokenId,
    sourceBetId: String(mapped.bet.SourceBetID),
    homeName: mapped.bet.HomeName,
    awayName: mapped.bet.AwayName,
    homeOdds: Number(mapped.bet.HomeOdds) || 0,
    awayOdds: Number(mapped.bet.AwayOdds) || 0,
    status: String(mapped.bet.Status ?? "Locked"),
  }));
  writePredictFunMarketIndex(buildPredictFunMarketIndexFromMapped(entries));
}
