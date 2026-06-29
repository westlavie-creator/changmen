/**
 * Gamma API：gameId ↔ event id/slug（VPS 直连，不经过浏览器插件）
 */

const POLYMARKET_GAMMA_API = "https://gamma-api.polymarket.com";
const ESPORTS_SPORT_KEYS = ["cs2", "lol", "dota2", "hok", "val"];
const DEFAULT_ESPORTS_SERIES_IDS = ["10310", "10311", "10309", "10434", "10369"];
const COLLECT_PAST_MS = 12 * 3600 * 1000;
const COLLECT_FUTURE_MS = 3600 * 1000;
const KEYSET_PAGE_LIMIT = 500;
const MAX_KEYSET_PAGES = 3;

function unwrapEvents(data) {
  if (Array.isArray(data))
    return data;
  if (data && typeof data === "object") {
    if (Array.isArray(data.data))
      return data.data;
    if (Array.isArray(data.events))
      return data.events;
  }
  return [];
}

function nextCursor(data) {
  if (!data || typeof data !== "object")
    return "";
  return String(data.next_cursor ?? data.nextCursor ?? "");
}

async function fetchJson(url) {
  const res = await fetch(url, {
    headers: { accept: "application/json" },
    signal: AbortSignal.timeout(25_000),
  });
  if (!res.ok)
    throw new Error(`Gamma ${res.status} ${url}`);
  return res.json();
}

async function fetchEsportsSeriesIds() {
  try {
    const sports = unwrapEvents(await fetchJson(`${POLYMARKET_GAMMA_API}/sports`));
    const ids = sports
      .filter(row => row?.sport && ESPORTS_SPORT_KEYS.includes(String(row.sport)))
      .map(row => String(row.series ?? "").trim())
      .filter(Boolean);
    if (ids.length)
      return [...new Set(ids)];
  }
  catch (err) {
    console.warn("[pm-sports] Gamma /sports fallback:", err.message);
  }
  return DEFAULT_ESPORTS_SERIES_IDS;
}

/**
 * @returns {Promise<{ byGameId: Map<number, { id: string, slug: string }>, bySlug: Map<string, { id: string, slug: string, gameId: number | null }> }>}
 */
export async function refreshGammaEventIndex() {
  const byGameId = new Map();
  const bySlug = new Map();
  const seriesIds = await fetchEsportsSeriesIds();
  let cursor = "";

  for (let page = 0; page < MAX_KEYSET_PAGES; page += 1) {
    const now = Date.now();
    const params = new URLSearchParams({
      closed: "false",
      limit: String(KEYSET_PAGE_LIMIT),
      order: "startTime",
      ascending: "true",
      start_time_min: new Date(now - COLLECT_PAST_MS).toISOString(),
      start_time_max: new Date(now + COLLECT_FUTURE_MS).toISOString(),
    });
    for (const id of seriesIds)
      params.append("series_id", id);
    if (cursor)
      params.set("after_cursor", cursor);

    const data = await fetchJson(`${POLYMARKET_GAMMA_API}/events/keyset?${params.toString()}`);
    const events = unwrapEvents(data);
    for (const event of events) {
      const id = event?.id != null ? String(event.id) : "";
      const slug = event?.slug != null ? String(event.slug) : "";
      const gameIdRaw = event?.gameId;
      const gameId = gameIdRaw != null ? Number(gameIdRaw) : null;
      const row = { id, slug, gameId: Number.isFinite(gameId) ? gameId : null };
      if (slug)
        bySlug.set(slug, row);
      if (id)
        bySlug.set(id, row);
      if (Number.isFinite(gameId))
        byGameId.set(gameId, { id, slug });
    }
    cursor = nextCursor(data);
    if (!cursor)
      break;
  }

  return { byGameId, bySlug };
}

/** Gamma 单条 slug 查询（keyset 索引未覆盖时的兜底） */
export async function fetchGammaEventBySlug(slug) {
  const s = String(slug || "").trim();
  if (!s)
    return null;
  try {
    const params = new URLSearchParams({ slug: s, limit: "1" });
    const data = await fetchJson(`${POLYMARKET_GAMMA_API}/events?${params.toString()}`);
    const events = unwrapEvents(data);
    const event = events[0];
    if (!event)
      return null;
    const id = event?.id != null ? String(event.id) : "";
    const eventSlug = event?.slug != null ? String(event.slug) : s;
    const gameIdRaw = event?.gameId;
    const gameId = gameIdRaw != null ? Number(gameIdRaw) : null;
    return {
      id,
      slug: eventSlug,
      gameId: Number.isFinite(gameId) ? gameId : null,
    };
  }
  catch (err) {
    console.warn("[pm-sports] Gamma event by slug failed:", err.message);
    return null;
  }
}
