import {
  findPolymarketWinnerIndex,
  isPolymarketMarketResolved,
} from "./orders";
import { parseJsonArray, type PolymarketRawMarket } from "./parse";

const LOSER_PRICE_MAX = 0.10;
const WINNER_PRICE_SOFT = 0.90;

/**
 * Gamma market outcomePrices：胜方已接近 1 且买入方为败方时拒单。
 */
export function getPolymarketMarketBlockReason(
  market: PolymarketRawMarket | null | undefined,
  tokenId: string,
): string | null {
  if (!market)
    return null;

  const tokens = parseJsonArray(market.clobTokenIds ?? market.clob_token_ids);
  const prices = parseJsonArray(market.outcomePrices ?? market.outcome_prices).map(Number);
  const idx = tokens.indexOf(String(tokenId));
  if (idx < 0 || !prices.length)
    return null;

  const myPrice = prices[idx];
  const winnerIdx = findPolymarketWinnerIndex(prices);

  if (isPolymarketMarketResolved(market) && winnerIdx >= 0 && winnerIdx !== idx)
    return "Polymarket 市场已决出胜负";

  if (Number.isFinite(myPrice) && myPrice <= LOSER_PRICE_MAX) {
    const otherMax = prices.reduce((max, p, i) => (i === idx ? max : Math.max(max, p)), 0);
    if (otherMax >= WINNER_PRICE_SOFT)
      return "Polymarket 盘口显示该结果几乎不可能（可能已结束）";
  }

  return null;
}
