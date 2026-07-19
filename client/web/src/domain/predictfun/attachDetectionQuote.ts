import type { BetOption } from "@changmen/client-core/models/betOption";
import { PLATFORMS } from "@changmen/venue-adapter/shared";
import { useOddsStore } from "@/stores/oddsStore";
import {
  isValidPredictClobPrice,
  lookupPredictFunMarketIdByToken,
  type PredictFunOptionQuoteData,
} from "@changmen/venue-adapter/predictfun";

function hasLockedPredictFunDetectionQuote(data: PredictFunOptionQuoteData): boolean {
  return isValidPredictClobPrice(Number(data.detectionMaxPrice ?? data.detectionClobPrice));
}

/** PF 预检前：从 fo / MarketIndex 写入 CLOB 原价与 marketId（Sources 有赔率时 fo 可能尚无行） */
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
    if (isValidPredictClobPrice(clobPrice))
      patch.detectionClobPrice = clobPrice;
  }
  if (patch.marketId || patch.detectionClobPrice != null)
    option.data = patch;
}
