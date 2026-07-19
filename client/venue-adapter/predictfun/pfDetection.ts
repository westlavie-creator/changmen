import type { BetOption } from "@changmen/client-core/models/betOption";
import { truncateOddsTo3 } from "@changmen/shared/odds_format";

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

/** fo clob 与当前展示赔率是否同一档（避免 Sources=1.587 却用旧 fo=0.62 限价） */
export function predictFunClobMatchesOdds(clobPrice: number, odds: number): boolean {
  if (!isValidPredictClobPrice(clobPrice) || !(odds > 1))
    return false;
  return truncateOddsTo3(1 / clobPrice) === truncateOddsTo3(odds);
}

/** 预检 MARKET FOK 限价上限：fo clob 与展示赔率一致时才用，否则 1/检测赔率 */
export function resolvePredictFunDetectionMaxPrice(
  option: BetOption,
  detectionOdds: number,
): number {
  const data = readOptionQuoteData(option);
  const locked = Number(data.detectionMaxPrice ?? data.detectionClobPrice);
  if (isValidPredictClobPrice(locked) && predictFunClobMatchesOdds(locked, detectionOdds))
    return locked;
  return detectionMaxPriceFromOdds(detectionOdds);
}

