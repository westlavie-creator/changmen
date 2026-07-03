import { fetchBatchSellPrices } from "@venue/polymarket/api";
import { decimalOddsFromProbability } from "@venue/polymarket/parse";
import { scaleUsdtToCnyDisplay } from "@changmen/shared/account_multiply";

export interface PmSellQuoteView {
  tokenId: string;
  bestBid: number;
  sellOdds: number;
  proceedsUsdc: number;
  profitUsdc: number;
  profitDisplay: number;
  updatedAt: number;
}

export function pmStakeUsdcFromRow(stakeUsdc: number | undefined, betMoneyDisplay: number): number {
  if (Number.isFinite(stakeUsdc) && (stakeUsdc ?? 0) > 0)
    return stakeUsdc!;
  const display = Number(betMoneyDisplay) || 0;
  return display > 0 ? display / scaleUsdtToCnyDisplay(1) : 0;
}

export function buildPmSellQuoteView(
  tokenId: string,
  shares: number,
  stakeUsdc: number,
  bestBid: number,
): PmSellQuoteView | null {
  if (!tokenId || !Number.isFinite(shares) || shares <= 0 || !Number.isFinite(bestBid) || bestBid <= 0)
    return null;
  const proceedsUsdc = Math.round(shares * bestBid * 10000) / 10000;
  const profitUsdc = Math.round((proceedsUsdc - stakeUsdc) * 10000) / 10000;
  return {
    tokenId,
    bestBid,
    sellOdds: decimalOddsFromProbability(bestBid),
    proceedsUsdc,
    profitUsdc,
    profitDisplay: scaleUsdtToCnyDisplay(profitUsdc),
    updatedAt: Date.now(),
  };
}

export async function fetchPmSellQuotes(
  entries: Array<{ tokenId: string; shares: number; stakeUsdc: number }>,
): Promise<Map<string, PmSellQuoteView>> {
  const uniqueIds = [...new Set(entries.map(e => e.tokenId).filter(Boolean))];
  const prices = uniqueIds.length ? await fetchBatchSellPrices(uniqueIds) : {};
  const out = new Map<string, PmSellQuoteView>();
  for (const entry of entries) {
    const bestBid = prices[entry.tokenId] ?? 0;
    const view = buildPmSellQuoteView(entry.tokenId, entry.shares, entry.stakeUsdc, bestBid);
    if (view)
      out.set(entry.tokenId, view);
  }
  return out;
}
