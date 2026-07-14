/**
 * Predict.fun REST → ClientMatchDto[]（棒球/足球只读；与 PM 列表并列，不合并）。
 * 不写电竞 client_matches / platform_*；不做跨站匹配；不开下注。
 *
 * 官方形态（dev.predict.fun MarketVariant / Get categories）：
 * - 棒球常为 SPORTS_TEAM_MATCH：单盘 SPORTS_MONEYLINE + 双 outcome（各含 team）
 * - 足球常为 SPORTS_MATCH：主/客/(平) 多盘；status 多为 REGISTERED + tradingStatus OPEN
 * 本机 Windows 往往直连 api.predict.fun TLS 失败 → 经 HK http-relay 出海。
 *
 * 缓存：storage/sport/{mlb_pf,soccer_pf}/（见 sport_list_cache.js）。
 */

import {
  readFreshSportListCache,
  readSportListCache,
  writeSportListCache,
} from "./sport_list_cache.js";

const PREDICT_FUN_API = String(
  process.env.PREDICT_FUN_API_BASE || "https://api.predict.fun",
).replace(/\/$/, "");

const PAGE_SIZE = 50;
const MAX_PAGES = 5;
const PAST_MS = 24 * 3600 * 1000;
const FUTURE_MS = 7 * 24 * 3600 * 1000;
const CACHE_TTL_MS = 30_000;
const MAX_TRACKED = 200;
const ORDERBOOK_CONCURRENCY = 8;

/** 官方 /v1/tags（联调快照）；失败时仍靠 name 过滤 */
const TAG_MLB = "142";
const TAG_BASEBALL = "143";
const TAG_SOCCER = "14";

/** @type {Map<string, { at: number, rows: object[] }>} */
const _caches = new Map();

/** @type {{ token: string, expMs: number } | null} */
let _relayTokenCache = null;

const ESPORT_RE = /\b(cs2|counter[- ]?strike|lol|league[- ]?of[- ]?legends|dota-?2|valorant|esport|esports|lck|lpl|lec|lcs|vct|blast|iem|esl)\b/i;
const NFL_RE = /\b(nfl|american football|ncaa football|cfb|ncaaf)\b/i;

/**
 * @param {string|undefined} name
 * @returns {"mlb"|"soccer"|null}
 */
export function mapPredictSportTag(name) {
  const raw = String(name ?? "").trim().toLowerCase();
  if (!raw || ESPORT_RE.test(raw) || NFL_RE.test(raw))
    return null;
  if (/\b(mlb|major league baseball|baseball)\b/.test(raw) || raw === "mlb")
    return "mlb";
  // 「Football」单独不做映射（美式/欧式均用）；需 Soccer / 联赛码
  if (
    /\b(soccer|epl|premier league|la liga|laliga|bundesliga|serie a|ligue 1|mls|ucl|uel|champions league|europa league|fifa|uefa|copa|eredivisie|liga mx|brasileir[aã]o|primera|world cup)\b/.test(raw)
    || raw === "soccer"
  ) {
    return "soccer";
  }
  return null;
}

/**
 * @param {object} category
 * @returns {"mlb"|"soccer"|null}
 */
export function resolveSportGameCodeFromCategory(category) {
  const tagNames = (category.tags ?? []).map(t => String(t.name ?? "").trim()).filter(Boolean);
  const lower = new Set(tagNames.map(n => n.toLowerCase()));
  if (lower.has("mlb") || lower.has("baseball"))
    return "mlb";
  if (lower.has("soccer") || lower.has("world cup"))
    return "soccer";
  if (lower.has("football") && !lower.has("nfl") && !NFL_RE.test([...lower].join(" "))) {
    // Football + 欧战/联赛码常见于 Soccer 盘；仅 football 则再看 league
    for (const team of category.teams ?? []) {
      const code = mapPredictSportTag(team.league);
      if (code)
        return code;
    }
  }
  for (const name of tagNames) {
    const code = mapPredictSportTag(name);
    if (code)
      return code;
  }
  for (const team of category.teams ?? []) {
    const code = mapPredictSportTag(team.league);
    if (code)
      return code;
  }
  return null;
}

function resolvePredictFunApiKey() {
  return String(
    process.env.PREDICT_FUN_API_KEY
    || process.env.VITE_PREDICT_FUN_API_KEY
    || "",
  ).trim();
}

function resolveHttpRelayOrigin() {
  return String(
    process.env.PREDICT_FUN_HTTP_RELAY_ORIGIN
    || process.env.HK_RELAY_ORIGIN
    || process.env.VITE_HK_RELAY_ORIGIN
    || process.env.VITE_PM_HK_RELAY_ORIGIN
    || "",
  ).trim().replace(/\/+$/, "");
}

async function resolveRelayAuthToken() {
  const fromEnv = String(
    process.env.PROBE_TOKEN
    || process.env.ESPORT_TEST_TOKEN
    || process.env.PREDICT_FUN_HTTP_RELAY_TOKEN
    || "",
  ).trim();
  if (fromEnv)
    return fromEnv;

  const now = Date.now();
  if (_relayTokenCache && _relayTokenCache.expMs > now + 60_000)
    return _relayTokenCache.token;

  const secret = String(process.env.JWT_SECRET || "").trim();
  if (secret.length < 16)
    return "";

  try {
    const { hasDatabaseUrlConfig, initDatabaseUrl, getPgPool } = await import("@changmen/db");
    if (!hasDatabaseUrlConfig())
      return "";
    await initDatabaseUrl();
    const pool = getPgPool("sport-pf-relay");
    if (!pool)
      return "";
    const { rows } = await pool.query(
      `SELECT p.id::text AS id FROM profiles p ORDER BY p.id LIMIT 1`,
    );
    const userId = String(rows[0]?.id || "").trim();
    if (!userId)
      return "";
    const { signJwt, JWT_ACCESS_TTL_SEC } = await import("../../../db/rds/jwt.js");
    const ttl = Math.min(Number(JWT_ACCESS_TTL_SEC) || 3600, 3600);
    const token = signJwt(
      { sub: userId, typ: "access", session_id: "sport-predictfun-fetch" },
      secret,
      ttl,
    );
    _relayTokenCache = { token, expMs: now + ttl * 1000 };
    return token;
  }
  catch (err) {
    console.warn("[sportPf] relay JWT skipped", err?.message || err);
    return "";
  }
}

async function predictHttpGetDirect(url) {
  const headers = { Accept: "application/json" };
  const apiKey = resolvePredictFunApiKey();
  if (apiKey)
    headers["x-api-key"] = apiKey;
  const res = await fetch(url, { headers });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(text.trim() || `HTTP ${res.status}`);
  }
  return res.json();
}

async function predictHttpGetViaRelay(url) {
  const origin = resolveHttpRelayOrigin();
  if (!origin)
    throw new Error("PREDICT_FUN_HTTP_RELAY_ORIGIN / HK_RELAY_ORIGIN 未配置");
  const token = await resolveRelayAuthToken();
  if (!token)
    throw new Error("http-relay 需要 PROBE_TOKEN 或可签发 JWT（JWT_SECRET + RDS）");

  const headers = {
    Accept: "application/json",
    token,
    "x-proxy-url": url,
    "x-proxy-referer": "https://predict.fun/",
    "x-proxy-origin": "https://predict.fun",
  };
  const apiKey = resolvePredictFunApiKey();
  if (apiKey)
    headers["x-api-key"] = apiKey;

  const res = await fetch(`${origin}/esport/http-relay`, { method: "GET", headers });
  const text = await res.text();
  if (!res.ok)
    throw new Error(text.trim() || `relay HTTP ${res.status}`);
  return JSON.parse(text);
}

/** @type {boolean | null} null=unknown, false=use relay, true=direct ok */
let _directOk = null;

/**
 * 直连优先；TLS/网络失败则走 HK http-relay（会话内记住，避免每个 orderbook 都先撞墙）。
 * @param {string} url
 */
async function predictHttpGet(url) {
  if (_directOk === false)
    return predictHttpGetViaRelay(url);

  if (_directOk === true) {
    try {
      return await predictHttpGetDirect(url);
    }
    catch (err) {
      _directOk = false;
      console.warn("[sportPf] predict.fun direct broke, switch to http-relay", err?.message || err);
      return predictHttpGetViaRelay(url);
    }
  }

  try {
    const data = await predictHttpGetDirect(url);
    _directOk = true;
    return data;
  }
  catch (err) {
    if (!resolveHttpRelayOrigin())
      throw err;
    _directOk = false;
    console.warn("[sportPf] direct predict.fun failed, using http-relay", err?.message || err);
    return predictHttpGetViaRelay(url);
  }
}

function variantsForGame(gameCode) {
  if (gameCode === "mlb")
    return ["SPORTS_TEAM_MATCH"];
  // soccer：官方以 SPORTS_MATCH 为主，另含 FIFA / 少数 TEAM_MATCH
  return ["SPORTS_MATCH", "SPORTS_TEAM_MATCH", "SPORTS_FIFA_WORLD_CUP", "SPORTS_FIFA_FRIENDLIES"];
}

function tagIdsForGame(gameCode) {
  if (gameCode === "mlb")
    return `${TAG_MLB},${TAG_BASEBALL}`;
  if (gameCode === "soccer")
    return TAG_SOCCER;
  return "";
}

async function fetchPredictCategoriesForGame(gameCode) {
  const byId = new Map();
  for (const marketVariant of variantsForGame(gameCode)) {
    let after;
    for (let page = 0; page < MAX_PAGES; page += 1) {
      const qs = new URLSearchParams({
        first: String(PAGE_SIZE),
        status: "OPEN",
        marketVariant,
      });
      const tagIds = tagIdsForGame(gameCode);
      if (tagIds)
        qs.set("tagIds", tagIds);
      if (after)
        qs.set("after", after);
      const res = await predictHttpGet(`${PREDICT_FUN_API}/v1/categories?${qs.toString()}`);
      const batch = Array.isArray(res?.data) ? res.data : [];
      for (const row of batch) {
        const id = String(row?.id ?? row?.slug ?? "");
        if (id && !byId.has(id))
          byId.set(id, row);
      }
      after = res?.cursor ? String(res.cursor) : undefined;
      if (!after || !batch.length)
        break;
    }
  }
  return [...byId.values()];
}

function bestAskFromPredictBook(book) {
  const asks = book?.asks ?? [];
  const first = asks[0];
  if (Array.isArray(first)) {
    const price = Number(first[0]);
    const size = Number(first[1]);
    if (Number.isFinite(price) && price > 0 && price < 1 && (!Number.isFinite(size) || size > 0))
      return price;
  }
  let best = Number.POSITIVE_INFINITY;
  for (const level of asks) {
    if (!Array.isArray(level))
      continue;
    const price = Number(level[0]);
    const size = Number(level[1]);
    if (Number.isFinite(price) && price > 0 && price < best && (!Number.isFinite(size) || size > 0))
      best = price;
  }
  return Number.isFinite(best) && best < 1 ? best : 0;
}

async function fetchPredictOrderbooks(marketIds) {
  const unique = [...new Set(marketIds.map(id => String(id)).filter(Boolean))];
  const out = {};
  for (let i = 0; i < unique.length; i += ORDERBOOK_CONCURRENCY) {
    const chunk = unique.slice(i, i + ORDERBOOK_CONCURRENCY);
    const rows = await Promise.all(chunk.map(async (id) => {
      try {
        const res = await predictHttpGet(
          `${PREDICT_FUN_API}/v1/markets/${encodeURIComponent(id)}/orderbook`,
        );
        return { id, book: res?.data ?? null };
      }
      catch {
        return { id, book: null };
      }
    }));
    for (const row of rows) {
      if (row.book)
        out[row.id] = row.book;
    }
  }
  return out;
}

function decimalOddsFromProbability(price) {
  const value = Number(price);
  if (!Number.isFinite(value) || value <= 0 || value >= 1)
    return 0;
  return Math.round((1 / value) * 1000) / 1000;
}

function isTradableMarket(market) {
  const trading = String(market.tradingStatus ?? "OPEN").toUpperCase();
  if (trading && !["OPEN", "MATCHING_NOT_PAUSED"].includes(trading))
    return false;
  const status = String(market.status ?? "").toUpperCase();
  // 官方运动盘常为 REGISTERED + trading OPEN（非电竞 OPEN）
  if (status && !["OPEN", "REGISTERED"].includes(status))
    return false;
  return true;
}

function startTimeMsOf(category) {
  const raw = category.startsAt;
  if (raw) {
    const ms = Date.parse(raw);
    if (Number.isFinite(ms))
      return ms;
  }
  return Date.now();
}

function startTimeAllowed(startMs) {
  const now = Date.now();
  return startMs >= now - PAST_MS && startMs <= now + FUTURE_MS;
}

function yesOutcome(market) {
  const outcomes = market.outcomes ?? [];
  return outcomes.find(o => String(o.name ?? "").toLowerCase() === "yes") ?? outcomes[0];
}

function outcomeProb(outcome, bookProb) {
  const ask = Number(outcome?.bestAsk);
  if (Number.isFinite(ask) && ask > 0 && ask < 1)
    return ask;
  if (Number.isFinite(bookProb) && bookProb > 0 && bookProb < 1)
    return bookProb;
  return 0;
}

/**
 * SPORTS_MATCH：主/客两队盘（跳过 Draw）
 * @returns {{ home: object, away: object, mode: "dual" } | null}
 */
function pickDualTeamMarkets(category) {
  const teamMarkets = (category.markets ?? []).filter((market) => {
    if (!isTradableMarket(market))
      return false;
    const title = String(market.title ?? "").trim().toLowerCase();
    if (title === "draw" || title === "tie")
      return false;
    return Boolean(market.team?.name || (title && title !== "draw"));
  });
  if (teamMarkets.length < 2)
    return null;
  const [home, away] = teamMarkets.slice(0, 2);
  const homeName = String(home.team?.name ?? home.title ?? "").trim();
  const awayName = String(away.team?.name ?? away.title ?? "").trim();
  if (!homeName || !awayName)
    return null;
  return { home, away, mode: "dual" };
}

/**
 * SPORTS_TEAM_MATCH 棒球：单盘双 outcome
 * @returns {{ market: object, homeOutcome: object, awayOutcome: object, mode: "single" } | null}
 */
function pickSingleMoneylineMarket(category) {
  const markets = (category.markets ?? []).filter(isTradableMarket);
  const ml = markets.find(m => String(m.marketType ?? "") === "SPORTS_MONEYLINE")
    || markets.find(m => (m.outcomes ?? []).length >= 2 && (m.outcomes ?? []).every(o => o.team || o.name));
  if (!ml)
    return null;
  const outcomes = ml.outcomes ?? [];
  if (outcomes.length < 2)
    return null;
  const withTeam = outcomes.filter(o => o.team?.name);
  const homeOutcome = withTeam[0] || outcomes[0];
  const awayOutcome = withTeam[1] || outcomes[1];
  if (!homeOutcome || !awayOutcome)
    return null;
  return { market: ml, homeOutcome, awayOutcome, mode: "single" };
}

/**
 * @param {object} category
 * @param {string} wantGame
 */
export function isPredictSportMoneylineCategory(category, wantGame) {
  const variant = String(category.marketVariant ?? "");
  if (!variant.startsWith("SPORTS_"))
    return false;
  if (String(category.status ?? "").toUpperCase() !== "OPEN")
    return false;
  if (resolveSportGameCodeFromCategory(category) !== wantGame)
    return false;
  return Boolean(pickDualTeamMarkets(category) || pickSingleMoneylineMarket(category));
}

function stableMatchId(key, idBase) {
  let h = 0;
  const s = String(key);
  for (let i = 0; i < s.length; i += 1)
    h = ((h << 5) - h + s.charCodeAt(i)) | 0;
  const n = Math.abs(h) || 1;
  return idBase + (n % 99_000_000);
}

/**
 * @param {object} category
 * @param {Record<string, number>} buyPrices marketId → best ask
 * @param {string} gameCode
 * @param {number} idBase
 */
function categoryToClientMatchDto(category, buyPrices, gameCode, idBase) {
  const categoryId = String(category.slug ?? category.id ?? "");
  const sourceMatchId = String(category.id ?? category.slug ?? categoryId);
  if (!categoryId || !sourceMatchId)
    return null;

  const dual = pickDualTeamMarkets(category);
  const single = dual ? null : pickSingleMoneylineMarket(category);
  if (!dual && !single)
    return null;

  let homeName;
  let awayName;
  let homeOdds = 0;
  let awayOdds = 0;
  let homeId;
  let awayId;

  if (dual) {
    homeName = String(dual.home.team?.name ?? dual.home.title ?? "").trim();
    awayName = String(dual.away.team?.name ?? dual.away.title ?? "").trim();
    const homeMarketId = String(dual.home.id ?? "");
    const awayMarketId = String(dual.away.id ?? "");
    const homeYes = yesOutcome(dual.home);
    const awayYes = yesOutcome(dual.away);
    homeOdds = decimalOddsFromProbability(outcomeProb(homeYes, buyPrices[homeMarketId]));
    awayOdds = decimalOddsFromProbability(outcomeProb(awayYes, buyPrices[awayMarketId]));
    homeId = String(homeYes?.onChainId ?? homeMarketId);
    awayId = String(awayYes?.onChainId ?? awayMarketId);
  }
  else {
    homeName = String(single.homeOutcome.team?.name ?? single.homeOutcome.name ?? "").trim();
    awayName = String(single.awayOutcome.team?.name ?? single.awayOutcome.name ?? "").trim();
    const marketId = String(single.market.id ?? "");
    // 单盘双 outcome：优先 outcome.bestAsk；orderbook 常为空
    homeOdds = decimalOddsFromProbability(outcomeProb(single.homeOutcome, 0));
    awayOdds = decimalOddsFromProbability(outcomeProb(single.awayOutcome, 0));
    homeId = String(single.homeOutcome.onChainId ?? `${marketId}-home`);
    awayId = String(single.awayOutcome.onChainId ?? `${marketId}-away`);
  }

  if (!homeName || !awayName)
    return null;

  const locked = !homeOdds || !awayOdds;
  const startTime = startTimeMsOf(category);
  const matchId = stableMatchId(`pf:${sourceMatchId}`, idBase);
  const betId = matchId * 10 + 1;
  const title = String(category.title ?? `${homeName} vs ${awayName}`).trim();

  return {
    ID: matchId,
    Title: title,
    Game: gameCode,
    GameID: 0,
    StartTime: startTime,
    Matchs: {
      PredictFun: sourceMatchId,
    },
    Bets: [{
      ID: betId,
      MatchID: matchId,
      Map: 0,
      Name: "Moneyline",
      HomeID: betId * 10 + 1,
      HomeName: homeName,
      AwayID: betId * 10 + 2,
      AwayName: awayName,
      Sources: {
        PredictFun: {
          Type: "PredictFun",
          BetID: categoryId,
          HomeID: homeId,
          AwayID: awayId,
          HomeOdds: homeOdds,
          AwayOdds: awayOdds,
          Status: locked ? "Locked" : "Normal",
        },
      },
    }],
  };
}

/**
 * @typedef {object} SportPredictFunOptions
 * @property {string} gameCode mlb | soccer
 * @property {string} cacheKey
 * @property {number} idBase
 * @property {string} [logTag]
 */

/**
 * @param {SportPredictFunOptions} options
 * @returns {Promise<object[]>}
 */
export async function fetchPredictFunSportAsClientMatchDtos(options) {
  const gameCode = String(options.gameCode || "").toLowerCase();
  if (gameCode !== "mlb" && gameCode !== "soccer")
    throw new Error(`unsupported PredictFun sport gameCode: ${options.gameCode}`);

  const cacheKey = String(options.cacheKey || `${gameCode}_pf`);
  const idBase = Number(options.idBase) || (gameCode === "mlb" ? 910_000_000 : 810_000_000);
  const logTag = String(options.logTag || `sportPf:${cacheKey}`);

  const mem = _caches.get(cacheKey);
  if (mem && Date.now() - mem.at < CACHE_TTL_MS)
    return mem.rows;

  const diskFresh = readFreshSportListCache(cacheKey);
  if (diskFresh) {
    _caches.set(cacheKey, { at: diskFresh.at, rows: diskFresh.rows });
    return diskFresh.rows;
  }

  try {
    if (!resolvePredictFunApiKey())
      throw new Error("PREDICT_FUN_API_KEY 未配置");

    const rawCategories = await fetchPredictCategoriesForGame(gameCode);
    const filtered = rawCategories.filter((category) => {
      if (!isPredictSportMoneylineCategory(category, gameCode))
        return false;
      return startTimeAllowed(startTimeMsOf(category));
    });

    const marketIds = [];
    for (const category of filtered) {
      const dual = pickDualTeamMarkets(category);
      if (dual) {
        if (dual.home.id != null)
          marketIds.push(String(dual.home.id));
        if (dual.away.id != null)
          marketIds.push(String(dual.away.id));
        continue;
      }
      const single = pickSingleMoneylineMarket(category);
      if (single?.market?.id != null)
        marketIds.push(String(single.market.id));
    }

    const books = await fetchPredictOrderbooks(marketIds.slice(0, MAX_TRACKED * 2));
    const buyPrices = {};
    for (const [id, book] of Object.entries(books)) {
      const ask = bestAskFromPredictBook(book);
      if (ask > 0 && ask < 1)
        buyPrices[id] = ask;
    }

    const rows = [];
    for (const category of filtered) {
      const dto = categoryToClientMatchDto(category, buyPrices, gameCode, idBase);
      if (dto)
        rows.push(dto);
      if (rows.length >= MAX_TRACKED)
        break;
    }

    const at = Date.now();
    _caches.set(cacheKey, { at, rows });
    try {
      writeSportListCache(cacheKey, rows, at);
    }
    catch (err) {
      console.warn(`[${logTag}] disk write skipped`, err?.message || err);
    }
    return rows;
  }
  catch (err) {
    const diskAny = readSportListCache(cacheKey);
    if (diskAny?.rows?.length) {
      console.warn(`[${logTag}] predict.fun failed, serving stale disk cache`, err?.message || err);
      _caches.set(cacheKey, { at: diskAny.at, rows: diskAny.rows });
      return diskAny.rows;
    }
    throw err;
  }
}

export async function fetchPredictFunMlbAsClientMatchDtos() {
  return fetchPredictFunSportAsClientMatchDtos({
    gameCode: "mlb",
    cacheKey: "mlb_pf",
    idBase: 910_000_000,
    logTag: "mlbPredictFun",
  });
}

export async function fetchPredictFunFootballAsClientMatchDtos() {
  return fetchPredictFunSportAsClientMatchDtos({
    gameCode: "soccer",
    cacheKey: "soccer_pf",
    idBase: 810_000_000,
    logTag: "footballPredictFun",
  });
}

export function clearSportPredictFunCache(cacheKey) {
  if (cacheKey) {
    _caches.delete(cacheKey);
    return;
  }
  _caches.clear();
}
