import type { BetOption } from "@changmen/client-core/models/betOption";
import { PLATFORMS } from "@changmen/venue-adapter/shared";
import { useOddsStore } from "@/stores/oddsStore";
import {
  isValidPredictClobPrice,
  lookupPredictFunMarketIdByToken,
  predictFunClobMatchesOdds,
  type PredictFunOptionQuoteData,
} from "@changmen/venue-adapter/predictfun";

function hasLockedPredictFunDetectionQuote(data: PredictFunOptionQuoteData): boolean {
  return isValidPredictClobPrice(Number(data.detectionMaxPrice ?? data.detectionClobPrice));
}

/** PF ????? fo / MarketIndex ?? CLOB ??? marketId?Sources ???? fo ?????? */
export function attachPredictFunDetectionQuote(option: BetOption): void {
  if (option.type !== PLATFORMS.PredictFun)
    return;
  const prior = (option.data && typeof option.data === "object"
    ? option.data
    : {}) as PredictFunOptionQuoteData & { marketId?: string };
  const row = useOddsStore().getEntry(PLATFORMS.PredictFun, option.itemId);
  const marketId = String(
    prior.marketId
    || row?.marketId
    || lookupPredictFunMarketIdByToken(option.itemId)
    || "",
  ).trim();
  const patch: PredictFunOptionQuoteData & { marketId?: string } = { ...prior };
  if (marketId && !prior.marketId)
    patch.marketId = marketId;
  if (!hasLockedPredictFunDetectionQuote(prior)) {
    const clobPrice = Number(row?.clobPrice);
    // ?? fo ?????????????????? Sources=1.587 / fo=0.62 ????
    if (isValidPredictClobPrice(clobPrice) && predictFunClobMatchesOdds(clobPrice, option.odds))
      patch.detectionClobPrice = clobPrice;
  }
  if (patch.marketId || patch.detectionClobPrice != null)
    option.data = patch as Record<string, unknown>;
}
