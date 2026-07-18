import { writePolymarketMarketIndex } from "@changmen/storage/polymarket_market_index.js";

/** @param {import("@changmen/api-contract").PolymarketMarketIndexEntry[]} entries */
export function buildPolymarketMarketIndexFromEntries(entries) {
  const assetIdSet = new Set();
  for (const row of entries) {
    if (row.homeTokenId)
      assetIdSet.add(String(row.homeTokenId));
    if (row.awayTokenId)
      assetIdSet.add(String(row.awayTokenId));
  }
  return {
    updatedAt: Date.now(),
    assetIds: [...assetIdSet],
    entries,
  };
}

/**
 * @param {Array<{
 *   marketId: string,
 *   assetIds: [string, string],
 *   match: { SourceMatchID: string },
 *   bet: Record<string, unknown>,
 * }>} candidates
 * @param {Record<string, number>} [buyPrices]
 */
export function persistPolymarketMarketIndex(candidates, buyPrices = {}) {
  const entries = candidates.map((mapped) => {
    const homeTokenId = String(mapped.assetIds[0] ?? "");
    const awayTokenId = String(mapped.assetIds[1] ?? "");
    const homeClob = Number(buyPrices[homeTokenId]);
    const awayClob = Number(buyPrices[awayTokenId]);
    const mapOutcome = mapped.mapOutcome === "home" || mapped.mapOutcome === "away"
      ? mapped.mapOutcome
      : undefined;
    const outcomeKind = mapped.outcomeKind === "official" || mapped.outcomeKind === "price"
      ? mapped.outcomeKind
      : undefined;
    return {
      sourceMatchId: String(mapped.match.SourceMatchID),
      marketId: String(mapped.marketId),
      homeTokenId,
      awayTokenId,
      sourceBetId: String(mapped.bet.SourceBetID ?? mapped.marketId),
      map: Number(mapped.bet.Map ?? 0),
      homeName: String(mapped.bet.HomeName ?? ""),
      awayName: String(mapped.bet.AwayName ?? ""),
      homeOdds: Number(mapped.bet.HomeOdds) || 0,
      awayOdds: Number(mapped.bet.AwayOdds) || 0,
      status: String(mapped.bet.Status ?? "Locked"),
      ...(Number.isFinite(homeClob) && homeClob > 0 && homeClob < 1
        ? { homeClobPrice: homeClob }
        : {}),
      ...(Number.isFinite(awayClob) && awayClob > 0 && awayClob < 1
        ? { awayClobPrice: awayClob }
        : {}),
      ...(mapOutcome ? { mapOutcome, outcomeKind: outcomeKind || "price" } : {}),
    };
  });
  writePolymarketMarketIndex(buildPolymarketMarketIndexFromEntries(entries));
}
