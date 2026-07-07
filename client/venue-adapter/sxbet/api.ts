import { normalizeEpochMs } from "@changmen/shared/time/match_time";
import { directGet } from "@changmen/client-core/shared/http";

export const SXBET_API = "https://api.sx.bet";
export const SXBET_ESPORTS_SPORT_ID = 9;
/** Market type 52 = moneyline (12) */
export const SXBET_MONEYLINE_TYPE = 52;

const COLLECT_PAST_MS = 6 * 3600 * 1000;
const COLLECT_FUTURE_MS = 3600 * 1000;
const MAX_PAGES = 20;
const PAGE_SIZE = 100;
const ORDER_BATCH_SIZE = 20;

export const SXBET_COLLECT_PAST_MS = COLLECT_PAST_MS;
export const SXBET_COLLECT_FUTURE_MS = COLLECT_FUTURE_MS;

export interface SxApiEnvelope<T> {
  status?: string;
  data?: T;
}

export interface SxMarket {
  status?: string;
  marketHash?: string;
  outcomeOneName?: string;
  outcomeTwoName?: string;
  teamOneName?: string;
  teamTwoName?: string;
  type?: number;
  gameTime?: number;
  sportXeventId?: string;
  liveEnabled?: boolean;
  sportLabel?: string;
  sportId?: number;
  leagueId?: number;
  leagueLabel?: string;
  participantOneId?: number;
  participantTwoId?: number;
}

export interface SxOrder {
  marketHash?: string;
  percentageOdds?: string | number;
  isMakerBettingOutcomeOne?: boolean;
  orderStatus?: string;
}

export function sxbetCollectStartTimeAllowed(startMs: number): boolean {
  const ms = normalizeEpochMs(startMs);
  if (!ms)
    return true;
  const now = Date.now();
  return ms >= now - COLLECT_PAST_MS && ms <= now + COLLECT_FUTURE_MS;
}

export async function fetchSxActiveEsportsMoneylineMarkets(): Promise<SxMarket[]> {
  const markets: SxMarket[] = [];
  let paginationKey: string | undefined;

  for (let page = 0; page < MAX_PAGES; page += 1) {
    const params = new URLSearchParams({
      sportIds: String(SXBET_ESPORTS_SPORT_ID),
      type: String(SXBET_MONEYLINE_TYPE),
      pageSize: String(PAGE_SIZE),
    });
    if (paginationKey)
      params.set("paginationKey", paginationKey);

    const res = await directGet<SxApiEnvelope<{ markets?: SxMarket[]; nextKey?: string }>>(
      `${SXBET_API}/markets/active?${params.toString()}`,
      {},
    );
    const batch = Array.isArray(res?.data?.markets) ? res.data!.markets! : [];
    for (const row of batch) {
      if (String(row.status ?? "").toUpperCase() === "ACTIVE")
        markets.push(row);
    }
    paginationKey = res?.data?.nextKey;
    if (!paginationKey || !batch.length)
      break;
  }

  return markets;
}

export async function fetchSxOrdersForMarkets(hashes: string[]): Promise<Record<string, SxOrder[]>> {
  const unique = [...new Set(hashes.map(h => String(h || "").trim()).filter(Boolean))];
  const grouped: Record<string, SxOrder[]> = Object.fromEntries(unique.map(hash => [hash, []]));
  if (!unique.length)
    return grouped;

  for (let i = 0; i < unique.length; i += ORDER_BATCH_SIZE) {
    const chunk = unique.slice(i, i + ORDER_BATCH_SIZE);
    try {
      const res = await directGet<SxApiEnvelope<SxOrder[]>>(
        `${SXBET_API}/orders?marketHashes=${chunk.map(h => encodeURIComponent(h)).join(",")}`,
        {},
      );
      const rows = Array.isArray(res?.data) ? res.data : [];
      for (const order of rows) {
        const hash = String(order.marketHash ?? "");
        if (!hash)
          continue;
        if (!grouped[hash])
          grouped[hash] = [];
        grouped[hash].push(order);
      }
    }
    catch {
      // keep empty books for failed chunk
    }
  }

  return grouped;
}
