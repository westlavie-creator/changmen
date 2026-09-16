import type { BetOption } from "@changmen/client-core/models/betOption";
import { isPendingConfirmVenueProvider } from "@changmen/shared/account_multiply";
import { PLATFORMS } from "@changmen/venue-adapter/shared";
import {
  isValidClobPrice,
  resolvePolymarketDetectionMaxPrice,
} from "@changmen/venue-adapter/polymarket";
import { resolvePredictFunDetectionMaxPrice } from "@changmen/venue-adapter/predictfun";
import { useOddsStore } from "@/stores/oddsStore";

const ASK_ABOVE_EPS = 1e-9;

function pendingDetectionOdds(option: BetOption): number {
  const data = option.data && typeof option.data === "object"
    ? option.data as { detectionOdds?: number }
    : undefined;
  const fromData = Number(data?.detectionOdds);
  if (Number.isFinite(fromData) && fromData > 1)
    return fromData;
  return Number(option.odds) || 0;
}

function pendingDetectionMaxPrice(option: BetOption): number | null {
  const detectionOdds = pendingDetectionOdds(option);
  if (!(detectionOdds > 1))
    return null;
  const maxPrice = option.type === PLATFORMS.PredictFun
    ? resolvePredictFunDetectionMaxPrice(option, detectionOdds)
    : resolvePolymarketDetectionMaxPrice(option, detectionOdds);
  return isValidClobPrice(maxPrice) ? maxPrice : null;
}

/**
 * 混合对即时馆 POST 前：有 fo 且（锁盘或卖一已高于检测上限）则挡住。
 * 无 fo 行 → null（放行）。不写 fo、不改 option。
 */
export function mixedPendingAskAboveDetection(pending: BetOption): string | null {
  if (!isPendingConfirmVenueProvider(pending.type))
    return null;
  const row = useOddsStore().getEntry(pending.type as never, pending.itemId);
  if (!row)
    return null;
  if (row.isLock)
    return "盘口已锁";
  const maxPrice = pendingDetectionMaxPrice(pending);
  if (maxPrice == null)
    return null;
  const clobPrice = Number(row.clobPrice);
  if (!isValidClobPrice(clobPrice))
    return null;
  if (clobPrice > maxPrice + ASK_ABOVE_EPS)
    return "fo 卖一高于上限";
  return null;
}
