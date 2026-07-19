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
  const marketIdSet = new Set();
  const entries = [];
  for (const mapped of candidates) {
    for (const id of mapped.marketIds || []) {
      if (id)
        marketIdSet.add(String(id));
    }
    if (mapped.homeMarketId)
      marketIdSet.add(String(mapped.homeMarketId));
    if (mapped.awayMarketId)
      marketIdSet.add(String(mapped.awayMarketId));
    const list = Array.isArray(mapped.bets) && mapped.bets.length
      ? mapped.bets
      : [mapped.bet];
    for (const bet of list) {
      const mid = String(bet.MarketID || mapped.homeMarketId || "");
      entries.push({
        sourceMatchId: String(mapped.match.SourceMatchID),
        categoryId: mapped.categoryId,
        homeMarketId: mid || mapped.homeMarketId,
        awayMarketId: mid || mapped.awayMarketId,
        homeTokenId: String(bet.SourceHomeID || mapped.homeTokenId),
        awayTokenId: String(bet.SourceAwayID || mapped.awayTokenId),
        sourceBetId: String(bet.SourceBetID),
        map: Number(bet.Map) || 0,
        homeName: bet.HomeName,
        awayName: bet.AwayName,
        homeOdds: Number(bet.HomeOdds) || 0,
        awayOdds: Number(bet.AwayOdds) || 0,
        status: String(bet.Status ?? "Locked"),
      });
      if (mid)
        marketIdSet.add(mid);
    }
  }
  writePredictFunMarketIndex({
    updatedAt: Date.now(),
    marketIds: [...marketIdSet],
    entries,
  });
}


