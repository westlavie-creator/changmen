/**
 * Predict.fun REST（VPS 直连 api.predict.fun，不经浏览器 http-relay）
 */

import { normalizeEpochMs } from "@changmen/shared/time/match_time";

export const PREDICT_FUN_API = String(
  process.env.PREDICT_FUN_API_BASE || "https://api.predict.fun",
).replace(/\/$/, "");

const COLLECT_PAST_MS = 6 * 3600 * 1000;
const COLLECT_FUTURE_MS = 3600 * 1000;
const PAGE_SIZE = 50;
const MAX_PAGES = 5;

export function resolvePredictFunApiKey() {
  return String(
    process.env.PREDICT_FUN_API_KEY
    || process.env.VITE_PREDICT_FUN_API_KEY
    || "",
  ).trim();
}

function predictHeaders() {
  const headers = { Accept: "application/json" };
  const apiKey = resolvePredictFunApiKey();
  if (apiKey)
    headers["x-api-key"] = apiKey;
  return headers;
}

export function predictCollectStartTimeAllowed(startMs) {
  const ms = normalizeEpochMs(startMs);
  if (!ms)
    return true;
  const now = Date.now();
  return ms >= now - COLLECT_PAST_MS && ms <= now + COLLECT_FUTURE_MS;
}

async function predictHttpGet(url) {
  const res = await fetch(url, { headers: predictHeaders() });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(text.trim() || `HTTP ${res.status}`);
  }
  return res.json();
}

export async function fetchPredictCategories(params = {}) {
  const categories = [];
  let after;
  for (let page = 0; page < MAX_PAGES; page += 1) {
    const qs = new URLSearchParams({
      first: String(PAGE_SIZE),
      status: params.status ?? "OPEN",
      marketVariant: params.marketVariant ?? "SPORTS_TEAM_MATCH",
    });
    if (after)
      qs.set("after", after);
    const res = await predictHttpGet(`${PREDICT_FUN_API}/v1/categories?${qs.toString()}`);
    const batch = Array.isArray(res?.data) ? res.data : [];
    categories.push(...batch);
    after = res?.cursor ? String(res.cursor) : undefined;
    if (!after || !batch.length)
      break;
  }
  return categories;
}

export async function fetchPredictOrderbook(marketId) {
  const id = String(marketId ?? "").trim();
  if (!id)
    return null;
  try {
    const res = await predictHttpGet(
      `${PREDICT_FUN_API}/v1/markets/${encodeURIComponent(id)}/orderbook`,
    );
    return res?.data ?? null;
  }
  catch {
    return null;
  }
}

export async function fetchPredictOrderbooks(marketIds, concurrency = 8) {
  const unique = [...new Set(marketIds.map(id => String(id)).filter(Boolean))];
  const out = {};
  for (let i = 0; i < unique.length; i += concurrency) {
    const chunk = unique.slice(i, i + concurrency);
    const rows = await Promise.all(chunk.map(async (id) => {
      const book = await fetchPredictOrderbook(id);
      return { id, book };
    }));
    for (const row of rows) {
      if (row.book)
        out[row.id] = row.book;
    }
  }
  return out;
}
