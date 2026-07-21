import type { BetOption } from "@changmen/client-core/models/betOption";
import { PLATFORMS } from "@changmen/venue-adapter/shared";
import { useOddsStore } from "@/stores/oddsStore";
import {
  hasLockedPolymarketDetectionQuote,
  isValidClobPrice,
  polymarketClobMatchesOdds,
  type PolymarketOptionQuoteData,
} from "@changmen/venue-adapter/polymarket";

/**
 * PM 预检前：从 fo 读取 CLOB 原价写入 option.data（唯一读 fo 入口）。
 * 仅当 fo clob 与建腿 option.odds 同一档才写入，避免限价被后来更乐观的 fo 收紧。
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
  if (!polymarketClobMatchesOdds(clobPrice, option.odds))
    return;
  option.data = { ...prior, detectionClobPrice: clobPrice };
}
