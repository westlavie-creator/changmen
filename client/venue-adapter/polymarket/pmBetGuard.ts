import type { BetOption } from "@changmen/client-core/models/betOption";
import { getPolymarketMarketBlockReason } from "./pmMarketGuard";
import {
  fetchClobMarketByConditionId,
  fetchGammaEventById,
  fetchGammaMarketByTokenId,
  gammaEventToPmSportLike,
  shouldRefreshPmSportForBet,
  type GammaEventLike,
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
    const conditionId = String(option.betId ?? "").trim();
    const [gammaSettled, clobSettled] = await Promise.allSettled([
      fetchGammaMarketByTokenId(option.itemId),
      conditionId ? fetchClobMarketByConditionId(conditionId) : Promise.resolve(null),
    ]);
    const market = gammaSettled.status === "fulfilled" ? gammaSettled.value : null;
    const clob = clobSettled.status === "fulfilled" ? clobSettled.value : null;

    if (shouldRefreshPmSportForBet(option)) {
      let gammaPm = null;
      const eventId = String(option.match?.providers?.Polymarket ?? "").trim();
      if (eventId) {
        const event = await fetchGammaEventById(eventId);
        gammaPm = gammaEventToPmSportLike(event);
      }
      if (!gammaPm && market) {
        const events = Array.isArray(market.events) ? market.events : [];
        const embedded = events[0] as GammaEventLike | undefined;
        if (embedded)
          gammaPm = gammaEventToPmSportLike(embedded);
      }

      const gammaReason = getPolymarketPmSportBlockReason(gammaPm, option.bet?.round);
      if (gammaReason)
        return `${gammaReason}（Gamma）`;
    }

    // CLOB 行优先：Gamma 仍显示接单时 CLOB 可能已 trading is disabled
    const clobReason = getPolymarketMarketBlockReason(clob, option.itemId);
    if (clobReason)
      return clobReason;
    const marketReason = getPolymarketMarketBlockReason(market, option.itemId);
    if (marketReason)
      return marketReason;
  }
  catch (err) {
    console.warn("[Polymarket] bet guard gamma check failed", err);
  }

  return null;
}
