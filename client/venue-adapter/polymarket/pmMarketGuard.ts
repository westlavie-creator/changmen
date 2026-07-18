import {
  isPolymarketMarketResolved,
  resolvePolymarketWinningAssetId,
} from "./orders";
import { parseJsonArray, type PolymarketRawMarket } from "./parse";

const LOSER_PRICE_MAX = 0.10;
const WINNER_PRICE_SOFT = 0.90;

/**
 * 已决出胜负（官方 winner 或 outcomePrices≥0.99）时拒买败方。
 * 另：盘口极冷门时软拒。
 */
export function getPolymarketMarketBlockReason(
  market: PolymarketRawMarket | null | undefined,
  tokenId: string,
): string | null {
  if (!market)
    return null;

  const asset = String(tokenId || "").trim();
  if (!asset) return null;

  if (isPolymarketMarketResolved(market)) {
    const winning = resolvePolymarketWinningAssetId(market);
    if (winning && winning !== asset)
      return "Polymarket 市场已决出胜负";
  }

  const tokens = parseJsonArray(market.clobTokenIds ?? market.clob_token_ids);
  const prices = parseJsonArray(market.outcomePrices ?? market.outcome_prices).map(Number);
  const idx = tokens.indexOf(asset);
  if (idx < 0 || !prices.length)
    return null;

  const myPrice = prices[idx];
  if (Number.isFinite(myPrice) && myPrice <= LOSER_PRICE_MAX) {
    const otherMax = prices.reduce((max, p, i) => (i === idx ? max : Math.max(max, p)), 0);
    if (otherMax >= WINNER_PRICE_SOFT)
      return "Polymarket 盘口显示该结果几乎不可能（可能已结束）";
  }

  return null;
}
