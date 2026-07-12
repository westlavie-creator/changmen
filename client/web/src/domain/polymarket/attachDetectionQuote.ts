import type { BetOption } from "@/models/betOption";
import { PLATFORMS } from "@/shared/platform";
import { useOddsStore } from "@/stores/oddsStore";
import {
  hasLockedPolymarketDetectionQuote,
  type PolymarketOptionQuoteData,
} from "@changmen/venue-adapter/polymarket";

/** PM 预检前：从 fo 读取 CLOB 原价写入 option.data（唯一读 fo 入口） */
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
  if (!Number.isFinite(clobPrice) || clobPrice <= 0 || clobPrice >= 1)
    return;
  option.data = { ...prior, detectionClobPrice: clobPrice };
}
