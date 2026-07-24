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

/**
 * 执行限价相对检测价缓冲（bps），压 check→submit 盘口竞态。
 * 默认 30bps（0.3%），且至少 +1 个 4 位 tick。
 * 只在即将打 API 时调用一次；勿对已 buffer 的 detectionMaxPrice 再套。
 */
export const PF_DETECTION_MAX_PRICE_BUFFER_BPS = 30;

export function applyPredictFunExecMaxPriceBuffer(maxPrice: number): number {
  if (!isValidPredictClobPrice(maxPrice))
    return maxPrice;
  const buffered = maxPrice * (1 + PF_DETECTION_MAX_PRICE_BUFFER_BPS / 10000);
  const withTick = Math.max(buffered, maxPrice + 0.0001);
  return Math.min(0.9999, Math.round(withTick * 10000) / 10000);
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

/**
 * 检测限价上限（原始，不含执行 buffer）。
 * 仅认 detectionClobPrice（fo 原价）；detectionMaxPrice 是已 buffer 的执行限价，不参与 raw。
 */
export function resolvePredictFunDetectionMaxPriceRaw(
  option: BetOption,
  detectionOdds: number,
): number {
  const data = readOptionQuoteData(option);
  const locked = Number(data.detectionClobPrice);
  if (isValidPredictClobPrice(locked) && predictFunClobMatchesOdds(locked, detectionOdds))
    return locked;
  return detectionMaxPriceFromOdds(detectionOdds);
}

/** 预检用的执行限价 = raw + buffer（单次） */
export function resolvePredictFunDetectionMaxPrice(
  option: BetOption,
  detectionOdds: number,
): number {
  return applyPredictFunExecMaxPriceBuffer(
    resolvePredictFunDetectionMaxPriceRaw(option, detectionOdds),
  );
}
