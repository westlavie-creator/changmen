import type { BetOption } from "@changmen/client-core/models/betOption";

export interface PredictFunOptionQuoteData {
  detectionOdds?: number;
  detectionMaxPrice?: number;
  detectionClobPrice?: number;
}

export function isValidPredictClobPrice(value: number): boolean {
  return Number.isFinite(value) && value > 0 && value < 1;
}

export function detectionMaxPriceFromOdds(detectionOdds: number): number {
  return Math.round((1 / detectionOdds) * 10000) / 10000;
}

function readOptionQuoteData(option: BetOption): PredictFunOptionQuoteData {
  if (!option.data || typeof option.data !== "object")
    return {};
  return option.data as PredictFunOptionQuoteData;
}

/** 预检 MARKET FOK 限价上限：优先 fo clobPrice，否则 1/检测赔率 */
export function resolvePredictFunDetectionMaxPrice(
  option: BetOption,
  detectionOdds: number,
): number {
  const data = readOptionQuoteData(option);
  const locked = Number(data.detectionMaxPrice ?? data.detectionClobPrice);
  if (isValidPredictClobPrice(locked))
    return locked;
  const fromFo = Number(data.detectionClobPrice);
  if (isValidPredictClobPrice(fromFo))
    return fromFo;
  return detectionMaxPriceFromOdds(detectionOdds);
}
