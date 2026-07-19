import type { BetOption } from "@changmen/client-core/models/betOption";
import { PLATFORMS } from "@changmen/venue-adapter/shared";
import { useOddsStore } from "@/stores/oddsStore";
import {
  isValidPredictClobPrice,
  type PredictFunOptionQuoteData,
} from "@changmen/venue-adapter/predictfun";

function hasLockedPredictFunDetectionQuote(data: PredictFunOptionQuoteData): boolean {
  return isValidPredictClobPrice(Number(data.detectionMaxPrice ?? data.detectionClobPrice));
}

/** PF 预检前：从 fo 读取 CLOB 原价写入 option.data（对齐 PM attachPolymarketDetectionQuote） */
export function attachPredictFunDetectionQuote(option: BetOption): void {
  if (option.type !== PLATFORMS.PredictFun)
    return;
  const prior = (option.data && typeof option.data === "object"
    ? option.data
    : {}) as PredictFunOptionQuoteData;
  if (hasLockedPredictFunDetectionQuote(prior))
    return;
  const row = useOddsStore().getEntry(PLATFORMS.PredictFun, option.itemId);
  const clobPrice = Number(row?.clobPrice);
  if (!isValidPredictClobPrice(clobPrice))
    return;
  option.data = { ...prior, detectionClobPrice: clobPrice };
}
