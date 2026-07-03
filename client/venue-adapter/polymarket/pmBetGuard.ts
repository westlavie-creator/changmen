import type { BetOption } from "@/models/betOption";
import { getPolymarketMarketBlockReason } from "./pmMarketGuard";
import {
  fetchGammaEventById,
  fetchGammaMarketByTokenId,
  gammaEventToPmSportLike,
  shouldRefreshPmSportForBet,
} from "./pmSportGamma";
import {
  getPolymarketPmSportBlockReason,
  getPolymarketPmSportBlockReasonFromOption,
} from "./pmSportGuard";

/** 下单前综合赛况闸：本地 pm_sport → Gamma 兜底 → outcomePrices */
export async function resolvePolymarketBetBlockReason(option: BetOption): Promise<string | null> {
  const local = getPolymarketPmSportBlockReasonFromOption(option);
  if (local)
    return local;

  try {
    const market = await fetchGammaMarketByTokenId(option.itemId);

    if (shouldRefreshPmSportForBet(option)) {
      let gammaPm = null;
      const eventId = String(option.match?.providers?.Polymarket ?? "").trim();
      if (eventId) {
        const event = await fetchGammaEventById(eventId);
        gammaPm = gammaEventToPmSportLike(event);
      }
      if (!gammaPm && market?.events?.[0])
        gammaPm = gammaEventToPmSportLike(market.events[0] as never);

      const gammaReason = getPolymarketPmSportBlockReason(gammaPm, option.bet?.round);
      if (gammaReason)
        return `${gammaReason}（Gamma）`;
    }

    const marketReason = getPolymarketMarketBlockReason(market, option.itemId);
    if (marketReason)
      return marketReason;
  }
  catch (err) {
    console.warn("[Polymarket] bet guard gamma check failed", err);
  }

  return null;
}
