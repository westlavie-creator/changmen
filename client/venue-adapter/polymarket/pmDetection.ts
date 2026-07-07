import type { BetOption } from "@changmen/client-core/models/betOption";

/** checkBet / betting 在 option.data 上携带的 PM 检测价（web attachDetectionQuote 写入 clobPrice） */
export interface PolymarketOptionQuoteData {
  detectionOdds?: number;
  detectionMaxPrice?: number;
  detectionClobPrice?: number;
}

export function hasLockedPolymarketDetectionQuote(data: PolymarketOptionQuoteData): boolean {
  const odds = Number(data.detectionOdds);
  if (!Number.isFinite(odds) || odds <= 1)
    return false;
  const price = Number(data.detectionMaxPrice ?? data.detectionClobPrice);
  return isValidClobPrice(price);
}

export function isValidClobPrice(value: number): boolean {
  return Number.isFinite(value) && value > 0 && value < 1;
}

/** 十进制赔率 → 检测价上限（无 fo clobPrice 时的回退） */
export function detectionMaxPriceFromOdds(detectionOdds: number): number {
  return Math.round((1 / detectionOdds) * 10000) / 10000;
}

function readOptionQuoteData(option: BetOption): PolymarketOptionQuoteData {
  if (!option.data || typeof option.data !== "object")
    return {};
  return option.data as PolymarketOptionQuoteData;
}

/**
 * 预检 FOK 限价上限：优先 fo 写入的 CLOB best_ask，否则 1/检测赔率。
 * 首次预检后 detectionClobPrice 写入 PolymarketBuyCheckData 并锁定。
 */
export function resolvePolymarketDetectionMaxPrice(
  option: BetOption,
  detectionOdds: number,
): number {
  const data = readOptionQuoteData(option);
  if (hasLockedPolymarketDetectionQuote(data)) {
    const locked = Number(data.detectionMaxPrice ?? data.detectionClobPrice);
    return locked;
  }
  const fromFo = Number(data.detectionClobPrice);
  if (isValidClobPrice(fromFo))
    return fromFo;
  return detectionMaxPriceFromOdds(detectionOdds);
}
