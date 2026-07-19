/**
 * Predict.fun REST（VPS 直连 api.predict.fun，不经浏览器 http-relay）
 */

import { normalizeEpochMs } from "@changmen/shared/time/match_time";

export const PREDICT_FUN_API = String(
  process.env.PREDICT_FUN_API_BASE || "https://api.predict.fun",
).replace(/\/$/, "");

/** 官方 /v1/tags：Esports */
export const PREDICT_FUN_TAG_ESPORTS = "83";

const COLLECT_PAST_MS = 6 * 3600 * 1000;
/** [changmen 临时] 默认未来 12h；可用 PREDICTFUN_COLLECTOR_FUTURE_MS 覆盖（恢复 A8 对齐时改回 1h） */
function collectFutureMs() {
  const n = Number(process.env.PREDICTFUN_COLLECTOR_FUTURE_MS);
  return Number.isFinite(n) && n > 0 ? n : 12 * 3600 * 1000;
}
const PAGE_SIZE = 50;
const MAX_PAGES = 8;

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
  return ms >= now - COLLECT_PAST_MS && ms <= now + collectFutureMs();
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
    });
    // 电竞：按 Esports tag 拉（ESPORTS_LOL/CS2…）；勿默认 SPORTS_TEAM_MATCH（那是 MLB）
    const tagIds = params.tagIds ?? (params.marketVariant ? undefined : PREDICT_FUN_TAG_ESPORTS);
    if (tagIds)
      qs.set("tagIds", String(tagIds));
    if (params.marketVariant)
      qs.set("marketVariant", String(params.marketVariant));
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
