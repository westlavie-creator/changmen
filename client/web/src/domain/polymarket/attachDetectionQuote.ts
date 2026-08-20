import type { BetOption } from "@changmen/client-core/models/betOption";
import { PLATFORMS } from "@changmen/venue-adapter/shared";
import { useOddsStore } from "@/stores/oddsStore";
import {
  hasLockedPolymarketDetectionQuote,
  isPmArbPriceBufferActive,
  isValidClobPrice,
  pmExecCapFromRawAsk,
  polymarketClobMatchesOdds,
  type PolymarketOptionQuoteData,
} from "@changmen/venue-adapter/polymarket";

/**
 * PM 预检前：从 fo 读取 CLOB 写入 option.data（唯一读 fo 入口）。
 * 关：仅当 fo 卖一与建腿赔率同档才锁（现网）。
 * 开：getOdds 已是 effective，与 fo 卖一对不上 → 锁 execCap，供 bet.ts 原样使用。
 */
export function attachPolymarketDetectionQuote(option: BetOption): void {
  if (option.type !== PLATFORMS.Polymarket)
    return;
  const prior = (option.data && typeof option.data === "object"
    ? option.data
    : {}) as PolymarketOptionQuoteData;
  if (hasLockedPolymarketDetectionQuote(prior))
    return;
  const row = useOddsStore().getEntry(PLATFORMS.Polymarket, option.itemId);
  const clobPrice = Number(row?.clobPrice);
  if (!isValidClobPrice(clobPrice))
    return;
  if (isPmArbPriceBufferActive()) {
    const cap = pmExecCapFromRawAsk(clobPrice);
    option.data = { ...prior, detectionClobPrice: cap, detectionMaxPrice: cap };
    return;
  }
  if (!polymarketClobMatchesOdds(clobPrice, option.odds))
    return;
  option.data = { ...prior, detectionClobPrice: clobPrice };
}
