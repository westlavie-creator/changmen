/**
 * Polymarket 足球 event/market → 展示 DTO
 * PM 足球：每场 3 个 Yes/No market（主胜/平/客胜），非电竞 2-outcome moneyline。
 */

/** @param {unknown} value */
export function parseJsonArray(value) {
  if (Array.isArray(value))
    return value.map(String).filter(Boolean);
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed)
      return [];
    try {
      const parsed = JSON.parse(trimmed);
      if (Array.isArray(parsed))
        return parsed.map(String).filter(Boolean);
    }
    catch {
      return [];
    }
  }
  return [];
}

/** @param {string | number | undefined} price */
export function decimalOddsFromProbability(price) {
  const value = Number(price);
  if (!Number.isFinite(value) || value <= 0 || value >= 1)
    return 0;
  return Math.floor((1 / value) * 1000) / 1000;
}

/** @param {string | undefined} title */
export function parseTeamsFromTitle(title) {
  const raw = String(title || "").trim();
  let m = /:\s*(.+?)\s+vs\.?\s+(.+?)\s*(?:\(|$)/i.exec(raw);
  if (m)
    return { home: m[1].trim(), away: m[2].trim() };
  m = /^(.+?)\s+vs\.?\s+(.+?)$/i.exec(raw);
  if (m)
    return { home: m[1].trim(), away: m[2].trim() };
  return { home: "", away: "" };
}

/** @param {string | undefined} score */
export function parseFootballScore(score) {
  const raw = String(score || "").trim();
  if (!raw)
    return null;
  const parts = raw.split("|");
  const scorePart = parts.length > 1 ? parts[1] : parts[0];
  const nums = String(scorePart).split("-").map(v => Number.parseInt(v, 10));
  if (!Number.isFinite(nums[0]) || !Number.isFinite(nums[1]))
    return null;
  return { home: nums[0], away: nums[1] };
}

/** @param {Record<string, unknown>} event */
function normalizeStatus(event) {
  if (event.ended === true)
    return "finished";
  const st = String(event.status ?? "").toLowerCase();
  if (st === "finished" || st === "final")
    return "finished";
  if (st === "postponed")
    return "postponed";
  if (st === "canceled" || st === "cancelled")
    return "canceled";
  if (event.live === true || st === "running" || st === "inprogress")
    return "live";
  if (st === "not_started" || st === "scheduled")
    return "scheduled";
  return "scheduled";
}

/** @param {Record<string, unknown>} event */
function startTimeOf(event) {
  const raw = event.startTime ?? event.startDate ?? event.start_date;
  if (raw === undefined || raw === null || raw === "")
    return Date.now();
  const numeric = Number(raw);
  if (Number.isFinite(numeric) && numeric > 0)
    return numeric > 1e12 ? numeric : numeric * 1000;
  const parsed = Date.parse(String(raw));
  return Number.isFinite(parsed) ? parsed : Date.now();
}

/** @param {string} title */
export function isPrimaryMatchEvent(title) {
  const raw = String(title || "").trim();
  if (!raw)
    return false;
  if (/\s-\s/.test(raw))
    return false;
  return /\svs\.?\s/i.test(raw);
}

function normalizeTeamKey(name) {
  return String(name || "").trim().toLowerCase().replace(/\s+/g, " ");
}

/** @param {Record<string, unknown>} market */
function yesNoTokenIds(market) {
  const assetIds = parseJsonArray(market.clob_token_ids ?? market.clobTokenIds);
  const outcomes = parseJsonArray(market.outcomes);
  if (assetIds.length !== 2 || outcomes.length !== 2)
    return null;
  const yesIdx = outcomes.findIndex(o => /^yes$/i.test(String(o).trim()));
  if (yesIdx < 0)
    return null;
  return { yesToken: assetIds[yesIdx], noToken: assetIds[yesIdx === 0 ? 1 : 0] };
}

/**
 * @param {Record<string, unknown>} event
 * @param {{ sport: string, name: string, series: string }} league
 * @param {Record<string, number>} buyPrices
 */
export function buildFootballMatchFromEvent(event, league, buyPrices = {}) {
  const title = String(event.title ?? "").trim();
  if (!isPrimaryMatchEvent(title))
    return null;

  const { home, away } = parseTeamsFromTitle(title);
  if (!home || !away)
    return null;

  const eventId = String(event.id ?? event.slug ?? "").trim();
  if (!eventId)
    return null;

  const markets = Array.isArray(event.markets) ? event.markets : [];
  let homeOdds = 0;
  let awayOdds = 0;
  let drawOdds = 0;

  const homeKey = normalizeTeamKey(home);
  const awayKey = normalizeTeamKey(away);

  for (const market of markets) {
    const question = String(market.question ?? market.title ?? "").trim();
    const qLower = question.toLowerCase();
    const tokens = yesNoTokenIds(market);
    if (!tokens)
      continue;

    const yesPrice = buyPrices[tokens.yesToken];
    const odds = decimalOddsFromProbability(yesPrice);

    if (/end in a draw/i.test(question)) {
      drawOdds = odds;
      continue;
    }

    const winMatch = /^will\s+(.+?)\s+win\b/i.exec(question);
    if (!winMatch)
      continue;
    const subject = normalizeTeamKey(winMatch[1].replace(/\s+on\s+[\d-]+.*$/i, "").trim());
    if (subject === homeKey || homeKey.includes(subject) || subject.includes(homeKey))
      homeOdds = odds;
    else if (subject === awayKey || awayKey.includes(subject) || subject.includes(awayKey))
      awayOdds = odds;
  }

  const startTime = startTimeOf(event);
  const status = normalizeStatus(event);
  const score = parseFootballScore(event.score ? String(event.score) : undefined);

  return {
    ID: eventId,
    League: league.sport,
    LeagueName: league.name,
    Title: title,
    HomeTeam: home,
    AwayTeam: away,
    StartTime: startTime,
    Status: status,
    Score: score,
    Period: event.period ? String(event.period) : undefined,
    Elapsed: event.elapsed != null ? String(event.elapsed) : undefined,
    Odds: {
      home: homeOdds,
      away: awayOdds,
      ...(drawOdds ? { draw: drawOdds } : {}),
    },
    Volume: Number(event.volume ?? 0) || undefined,
    PmSlug: event.slug ? String(event.slug) : undefined,
    PmGameId: event.gameId != null ? Number(event.gameId) : undefined,
    UpdatedAt: Date.now(),
  };
}

/**
 * @param {Array<Record<string, unknown>>} events
 * @param {Map<string, { sport: string, name: string, series: string }>} seriesToLeague
 * @param {Record<string, number>} buyPrices
 * @param {{ pastMs: number, futureMs: number }} window
 */
export function buildFootballMatchesFromEvents(events, seriesToLeague, buyPrices, window) {
  const matches = [];
  const seen = new Set();
  const now = Date.now();
  const min = now - window.pastMs;
  const max = now + window.futureMs;

  for (const event of events) {
    const startTime = startTimeOf(event);
    if (startTime < min || startTime > max)
      continue;

    const seriesId = String(event.seriesId ?? event.series_id ?? "").trim();
    const seriesSlug = String(event.seriesSlug ?? event.series_slug ?? "").trim();
    const league = seriesToLeague.get(seriesId)
      || seriesToLeague.get(seriesSlug)
      || { sport: seriesSlug || "soccer", name: seriesSlug || "Soccer", series: seriesId };

    const row = buildFootballMatchFromEvent(event, league, buyPrices);
    if (!row)
      continue;
    const key = String(row.PmSlug || row.ID);
    if (seen.has(key))
      continue;
    seen.add(key);
    matches.push(row);
  }

  matches.sort((a, b) => a.StartTime - b.StartTime);
  return matches;
}

/** @deprecated use buildFootballMatchFromEvent — kept for tests */
export function buildFootballMatch(event, market, league, buyPrices = {}) {
  if (!market)
    return buildFootballMatchFromEvent(event, league, buyPrices);
  const merged = {
    ...event,
    markets: [market, ...(Array.isArray(event.markets) ? event.markets : [])],
  };
  return buildFootballMatchFromEvent(merged, league, buyPrices);
}
