/**
 * SX.bet REST（VPS 直连 api.sx.bet，不经浏览器）
 * @see https://docs.sx.bet/api-reference/introduction
 */

import { normalizeEpochMs } from "@changmen/shared/time/match_time";

export const SXBET_API = String(process.env.SXBET_API_BASE || "https://api.sx.bet").replace(/\/$/, "");
export const SXBET_ESPORTS_SPORT_ID = 9;
/** Market type 52 = moneyline (12) */
export const SXBET_MONEYLINE_TYPE = 52;
export const SXBET_USDC = "0x6629Ce1Cf35Cc1329ebB4F63202F3f197b3F050B";

const DEFAULT_COLLECT_PAST_MS = 6 * 3600 * 1000;
/** 电竞赛程常在数日后；默认未来 7 天（可用 SXBET_COLLECTOR_FUTURE_MS 覆盖） */
const DEFAULT_COLLECT_FUTURE_MS = 7 * 24 * 3600 * 1000;
const MAX_PAGES = 20;
const PAGE_SIZE = 100;
const BEST_ODDS_BATCH = 40;

function collectFutureMs() {
  const n = Number(process.env.SXBET_COLLECTOR_FUTURE_MS);
  return Number.isFinite(n) && n > 0 ? n : DEFAULT_COLLECT_FUTURE_MS;
}

function collectPastMs() {
  const n = Number(process.env.SXBET_COLLECTOR_PAST_MS);
  return Number.isFinite(n) && n > 0 ? n : DEFAULT_COLLECT_PAST_MS;
}

export const SXBET_COLLECT_PAST_MS = DEFAULT_COLLECT_PAST_MS;
export const SXBET_COLLECT_FUTURE_MS = DEFAULT_COLLECT_FUTURE_MS;

export function sxbetCollectStartTimeAllowed(startMs) {
  const ms = normalizeEpochMs(startMs);
  if (!ms)
    return true;
  const now = Date.now();
  if (ms > now + collectFutureMs())
    return false;
  if (ms < now - collectPastMs())
    return false;
  return true;
}

async function sxHttpGet(url) {
  const res = await fetch(url, { headers: { Accept: "application/json" } });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(text.trim() || `HTTP ${res.status}`);
  }
  return res.json();
}

/** @returns {Promise<object[]>} */
export async function fetchSxActiveEsportsMoneylineMarkets() {
  const markets = [];
  let paginationKey;

  for (let page = 0; page < MAX_PAGES; page += 1) {
    const params = new URLSearchParams({
      sportIds: String(SXBET_ESPORTS_SPORT_ID),
      type: String(SXBET_MONEYLINE_TYPE),
      pageSize: String(PAGE_SIZE),
    });
    if (paginationKey)
      params.set("paginationKey", paginationKey);

    const res = await sxHttpGet(`${SXBET_API}/markets/active?${params.toString()}`);
    const batch = Array.isArray(res?.data?.markets) ? res.data.markets : [];
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

/**
 * 官方推荐：`GET /orders/odds/best` — maker 视角最优价
 * @param {string[]} hashes
 * @param {string} [baseToken]
 * @returns {Promise<Record<string, object>>}
 */
export async function fetchSxBestOdds(hashes, baseToken = SXBET_USDC) {
  const unique = [...new Set(hashes.map(h => String(h || "").trim()).filter(Boolean))];
  const out = {};
  if (!unique.length)
    return out;

  for (let i = 0; i < unique.length; i += BEST_ODDS_BATCH) {
    const chunk = unique.slice(i, i + BEST_ODDS_BATCH);
    try {
      const params = new URLSearchParams({
        marketHashes: chunk.join(","),
        baseToken,
      });
      const res = await sxHttpGet(`${SXBET_API}/orders/odds/best?${params.toString()}`);
      for (const row of res?.data?.bestOdds ?? []) {
        const hash = String(row.marketHash ?? "").trim();
        if (hash)
          out[hash] = row;
      }
    }
    catch {
      // leave missing markets empty
    }
  }
  return out;
}
