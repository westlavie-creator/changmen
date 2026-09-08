/**
 * OB 体育足球只读列表：HTTP 快照，不做 SaveMatch，不写 platform_* / client_matches。
 * 凭证只读 sport/ob_session.json（与电竞 platforms.json OB 隔离）。
 */
import { createHash } from "node:crypto";
import {
  SPORT_DISK_TTL_MS,
  clearSportListCache,
  readSportListCache,
  writeSportListCache,
} from "./sport_list_cache.js";
import {
  MARKET_MONEYLINE,
  MARKET_SPREADS,
  MARKET_TOTALS,
  UNKNOWN_FOOTBALL_GAME,
  displayBetName,
  encodeSportBetId,
  isFootballOutcomeLabelName,
  mapObFootballTournamentToGame,
  resolveFootballLeagueFromText,
} from "./sport_football_markets.js";
import {
  OB_FOOTBALL_ID_BASE,
  OB_HPID_MARKET,
  decodeObSportPbPayload,
  extractObPlaySelections,
  listBetsFromObPlayData,
  playsFromObMatchRow,
} from "./sport_ob_odds.js";
import { readSportObSession } from "./sport_ob_session.js";

const CACHE_KEY = "soccer_ob_v3";
/** 内存新鲜窗口；足球页 30s 轮询不得每次重打 700+ 场赔率 */
const CACHE_TTL_MS = 120_000;
const ODDS_BATCH = 12;
const BATCH_GAP_MS = 400;
const RATE_LIMIT_SLEEP_MS = 2_000;
const MAX_RATE_LIMIT_HITS = 5;
const CSID_FOOTBALL = "1";
/** 九游/OB 体育 PC 足球菜单 euid（列表/赛程实测） */
const EUID_FOOTBALL = "3020101";
const SCHEDULE_PATH = "/yewu11/v2/w/structureTournamentMatchesPB";
const LIST_ODDS_PATH = "/yewu11/v1/w/structureMatchBaseInfoByMidsPB";
const DETAIL_ODDS_PATH = "/yewu11/v1/w/getMatchBaseInfoByOddsPB";
const CATEGORY_PATH = "/yewu11/v1/w/category/getCategoryList";
const PLAY_ODDS_PATH = "/yewu11/v1/w/getOddsFromPlayPB";

/** @type {{ at: number, rows: object[] } | null} */
let memCache = null;
/** @type {Promise<object[]> | null} */
let inflight = null;

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function stableObMatchId(mid) {
  const s = String(mid || "");
  const buf = createHash("sha1").update(s).digest();
  return OB_FOOTBALL_ID_BASE + (buf.readUInt32BE(0) % 9_000_000);
}

function uuidNoDash() {
  return (globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random()}`).replace(/-/g, "");
}

/** 体育 PC checkId 中间段：sessionId 前 18 位数字（cuid） */
function sportCuid(session) {
  const digits = String(session?.sessionId || session?.uid || "").replace(/\D/g, "");
  if (digits.length >= 18)
    return digits.slice(0, 18);
  return digits || "0";
}

function buildHeaders(session) {
  const token = String(session.token || "");
  const cuid = sportCuid(session);
  const ts = Date.now();
  const referer = String(session.referer || "").trim() || "https://user-pc-new.example.com/";
  let origin = "";
  try {
    origin = new URL(referer).origin;
  }
  catch {
    origin = "";
  }
  return {
    "Content-Type": "application/json",
    Accept: "application/json, text/plain, */*",
    lang: "zh",
    requestId: token,
    checkId: `pc-${uuidNoDash()}-${cuid}-${ts}`,
    "request-code": "{\"panda-bss-source\":\"2\"}",
    Referer: referer,
    ...(origin ? { Origin: origin } : {}),
  };
}

function gatewayOrigin(session) {
  const g = String(session.gateway || "").trim().replace(/\/$/, "");
  if (!g)
    return "";
  try {
    return new URL(g).origin;
  }
  catch {
    return g.startsWith("http") ? g : `https://${g}`;
  }
}

async function postPb(session, apiPath, body) {
  const origin = gatewayOrigin(session);
  if (!origin)
    throw new Error("sport OB session missing gateway");
  const url = `${origin}${apiPath}${apiPath.includes("?") ? "&" : "?"}t=${Date.now()}`;
  const res = await fetch(url, {
    method: "POST",
    headers: buildHeaders(session),
    body: JSON.stringify(body ?? {}),
  });
  const text = await res.text();
  let envelope = null;
  try {
    envelope = JSON.parse(text);
  }
  catch {
    throw new Error(`OB sport HTTP ${res.status} non-json ${apiPath}`);
  }
  const code = envelope?.code;
  if (code != null && String(code) !== "0" && String(code) !== "0000000") {
    const msg = String(envelope?.msg || envelope?.message || code);
    throw new Error(`OB sport ${apiPath} code=${code} ${msg}`);
  }
  const decoded = decodeObSportPbPayload(envelope);
  if (decoded == null)
    throw new Error(`OB sport ${apiPath} decode failed`);
  return decoded;
}

async function getJson(session, apiPath) {
  const origin = gatewayOrigin(session);
  if (!origin)
    throw new Error("sport OB session missing gateway");
  const url = `${origin}${apiPath}${apiPath.includes("?") ? "&" : "?"}t=${Date.now()}`;
  const res = await fetch(url, {
    method: "GET",
    headers: buildHeaders(session),
  });
  const text = await res.text();
  let envelope = null;
  try {
    envelope = JSON.parse(text);
  }
  catch {
    throw new Error(`OB sport HTTP ${res.status} non-json ${apiPath}`);
  }
  const code = envelope?.code;
  if (code != null && String(code) !== "0" && String(code) !== "0000000") {
    const msg = String(envelope?.msg || envelope?.message || code);
    throw new Error(`OB sport ${apiPath} code=${code} ${msg}`);
  }
  if (Array.isArray(envelope?.data))
    return envelope.data;
  const decoded = decodeObSportPbPayload(envelope);
  if (decoded == null)
    throw new Error(`OB sport ${apiPath} decode failed`);
  return decoded;
}

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function unwrapData(decoded) {
  if (!decoded || typeof decoded !== "object")
    return decoded;
  if (decoded.data && typeof decoded.data === "object")
    return decoded.data;
  return decoded;
}

function collectFootballMatches(decoded) {
  const root = unwrapData(decoded);
  const bags = [
    ...asArray(root?.livedata),
    ...asArray(root?.nolivedata),
    ...asArray(root?.data),
    ...asArray(root?.list),
    ...asArray(root),
  ];
  /** @type {Map<string, object>} */
  const byMid = new Map();
  for (const tour of bags) {
    const csid = String(tour?.csid ?? tour?.sportId ?? tour?.sid ?? "");
    const midsRaw = tour?.mids ?? tour?.mid;
    const tid = String(tour?.tid ?? tour?.tournamentId ?? tour?.id ?? "");
    const tn = String(tour?.tn ?? tour?.nameText ?? tour?.n ?? "");
    const mgt = tour?.mgt ?? tour?.startTime ?? tour?.mgtStr;
    const midList = Array.isArray(midsRaw)
      ? midsRaw.map(String)
      : String(midsRaw || "").split(",").map(s => s.trim()).filter(Boolean);
    const isFootball = !csid || csid === CSID_FOOTBALL;
    if (!isFootball)
      continue;
    for (const mid of midList) {
      if (!byMid.has(mid)) {
        byMid.set(mid, {
          mid,
          tid,
          tn,
          startTime: Number(mgt) || 0,
        });
      }
    }
    const nested = asArray(tour?.mls || tour?.matches || tour?.ms);
    for (const m of nested) {
      const mid = String(m?.mid ?? m?.id ?? "");
      if (!mid)
        continue;
      const mCsid = String(m?.csid ?? csid);
      if (mCsid && mCsid !== CSID_FOOTBALL)
        continue;
      byMid.set(mid, {
        mid,
        tid: String(m?.tid ?? tid),
        tn: String(m?.tn ?? tn),
        startTime: Number(m?.mgt ?? m?.mgtStr ?? m?.startTime ?? mgt) || 0,
        home: String(m?.mhn ?? m?.home ?? ""),
        away: String(m?.man ?? m?.away ?? ""),
      });
    }
  }
  return [...byMid.values()];
}

function startTimeMs(raw) {
  const n = Number(raw) || 0;
  if (n <= 0)
    return 0;
  return n > 1e12 ? n : n * 1000;
}

function chunk(list, size) {
  const out = [];
  for (let i = 0; i < list.length; i += size)
    out.push(list.slice(i, i + size));
  return out;
}

async function fetchSchedule(session) {
  const cuid = sportCuid(session);
  const decoded = await postPb(session, SCHEDULE_PATH, {
    cuid,
    sort: 1,
    tid: "",
    apiType: 1,
    orpt: 0,
    euid: EUID_FOOTBALL,
  });
  const rows = collectFootballMatches(decoded);
  if (!rows.length)
    throw new Error("OB sport schedule empty");
  return rows;
}

function ingestOddsRows(decoded, byMid) {
  const root = unwrapData(decoded);
  const rows = asArray(root?.data).length ? asArray(root.data) : asArray(root);
  for (const row of rows) {
    const mid = String(row?.mid ?? row?.id ?? "");
    if (mid)
      byMid.set(mid, row);
  }
}

function isRateLimited(err) {
  return /0401038|人数过多|too many/i.test(String(err?.message || err));
}

async function fetchOddsBatchOnce(session, part) {
  const cuid = sportCuid(session);
  return postPb(session, LIST_ODDS_PATH, {
    cuid,
    euid: EUID_FOOTBALL,
    mids: part.join(","),
  });
}

async function fetchOddsByMids(session, mids) {
  /** @type {Map<string, object>} */
  const byMid = new Map();
  /** @type {string[][]} */
  const queue = chunk(mids, ODDS_BATCH);
  let rateHits = 0;
  let failN = 0;
  let lastFail = "";
  while (queue.length) {
    const part = queue.shift();
    try {
      const decoded = await fetchOddsBatchOnce(session, part);
      ingestOddsRows(decoded, byMid);
    }
    catch (err) {
      failN += 1;
      lastFail = String(err?.message || err);
      if (isRateLimited(err)) {
        rateHits += 1;
        if (rateHits >= MAX_RATE_LIMIT_HITS) {
          console.warn(
            `[sportObFootball] stop odds after rate-limit x${rateHits}; kept ${byMid.size}/${mids.length}; ${lastFail}`,
          );
          break;
        }
        await sleep(RATE_LIMIT_SLEEP_MS);
        if (part.length > 4) {
          const mid = Math.ceil(part.length / 2);
          queue.unshift(part.slice(mid), part.slice(0, mid));
        }
        else {
          queue.unshift(part);
        }
        continue;
      }
      if (failN <= 3 || failN % 10 === 0)
        console.warn("[sportObFootball] odds batch failed", part.length, lastFail);
    }
    if (queue.length)
      await sleep(BATCH_GAP_MS);
  }
  if (failN)
    console.warn(`[sportObFootball] odds done kept=${byMid.size}/${mids.length} fails=${failN} last=${lastFail}`);
  return byMid;
}

function matchRowFromDecoded(decoded) {
  const envelope = decoded && typeof decoded === "object" && !Array.isArray(decoded)
    ? decoded
    : {};
  const row = asArray(envelope.data)[0]
    || (envelope.mid ? envelope : null)
    || (Array.isArray(decoded) ? decoded[0] : null);
  if (row && Array.isArray(envelope.playData) && envelope.playData.length)
    row.playData = envelope.playData;
  return row || null;
}

async function fetchOddsDetailByMid(session, mid) {
  const cuid = sportCuid(session);
  const decoded = await postPb(session, DETAIL_ODDS_PATH, {
    cuid,
    cos: 0,
    orpt: 0,
    euid: EUID_FOOTBALL,
    mid: String(mid),
    mcid: 0,
    newUser: 0,
  });
  return matchRowFromDecoded(decoded);
}

async function fetchCategoryPlayIds(session, mid) {
  try {
    const decoded = await getJson(
      session,
      `${CATEGORY_PATH}?sportId=${CSID_FOOTBALL}&mid=${encodeURIComponent(String(mid))}`,
    );
    const cats = Array.isArray(decoded)
      ? decoded
      : asArray(decoded?.data);
    const all = cats.find(c => /所有/.test(String(c?.marketName || c?.name || ""))) || cats[0];
    return asArray(all?.plays).map(x => String(x)).filter(Boolean);
  }
  catch (err) {
    console.warn("[sportObFootball] category list", err?.message || err);
    return [];
  }
}

function playIdsFromRow(row) {
  return asArray(row?.hpsPns).map(p => String(p?.hpid ?? p?.pid ?? "")).filter(Boolean);
}

async function fetchOddsByHpid(session, mid, hpid) {
  const decoded = await postPb(session, PLAY_ODDS_PATH, {
    cuid: sportCuid(session),
    euid: EUID_FOOTBALL,
    mid: String(mid),
    hpid: String(hpid),
    csid: CSID_FOOTBALL,
  });
  return matchRowFromDecoded(decoded) || decoded;
}

function isFootballListMarket(code, hpid) {
  const spec = OB_HPID_MARKET[String(hpid || "")];
  if (spec)
    return spec.marketCode === MARKET_SPREADS || spec.marketCode === MARKET_TOTALS;
  const c = String(code || "");
  return c === MARKET_SPREADS
    || c === MARKET_TOTALS
    || c === `ht_${MARKET_SPREADS}`
    || c === `ht_${MARKET_TOTALS}`;
}

function dtoMarketCode(raw) {
  return String(raw || MARKET_MONEYLINE);
}

function buildDto(meta, oddsRow) {
  const mid = String(meta.mid);
  const matchId = stableObMatchId(mid);
  let home = String(oddsRow?.mhn || meta.home || "").trim();
  let away = String(oddsRow?.man || meta.away || "").trim();
  if (isFootballOutcomeLabelName(home) || isFootballOutcomeLabelName(away)) {
    home = String(meta.home || "").trim();
    away = String(meta.away || "").trim();
  }
  if (!home || !away || isFootballOutcomeLabelName(home) || isFootballOutcomeLabelName(away))
    return null;
  const tid = String(oddsRow?.tid || meta.tid || "");
  const tn = String(oddsRow?.tn || meta.tn || "");
  const game = mapObFootballTournamentToGame(tid)
    || resolveFootballLeagueFromText(tn)
    || UNKNOWN_FOOTBALL_GAME;
  const startTime = startTimeMs(oddsRow?.mgt || oddsRow?.mgtStr || meta.startTime);
  const playData = playsFromObMatchRow(oddsRow);
  const listBets = listBetsFromObPlayData(playData);
  /** @type {object[]} */
  const bets = [];
  let seq = 0;
  const seen = new Set();
  for (const b of listBets) {
    const marketCode = dtoMarketCode(b.marketCode);
    if (!isFootballListMarket(marketCode, b.hpid))
      continue;
    const lineKey = b.line == null ? "" : String(b.line);
    const uniq = `${marketCode}|${lineKey}`;
    if (seen.has(uniq))
      continue;
    seen.add(uniq);
    seq += 1;
    const betId = encodeSportBetId(matchId, seq);
    const isTotals = marketCode === MARKET_TOTALS
      || marketCode === `ht_${MARKET_TOTALS}`;
    const title = String(b.name || "").trim();
    const name = title && !/^(moneyline|spreads|totals|ob:)/i.test(title)
      ? title
      : displayBetName(marketCode, b.line);
    /** @type {Record<string, unknown>} */
    const src = {
      Type: "OB",
      BetID: String(b.homeOid || `${mid}-${marketCode}-${seq}`),
      HomeID: String(b.homeOid || `${mid}-h-${seq}`),
      AwayID: String(b.awayOid || `${mid}-a-${seq}`),
      HomeOdds: b.homeOdds,
      AwayOdds: b.awayOdds,
      Status: (b.homeOdds > 0 && b.awayOdds > 0) ? "Normal" : "Locked",
    };
    if (b.drawOdds > 0)
      src.DrawOdds = b.drawOdds;
    if (b.drawOid)
      src.DrawID = b.drawOid;
    bets.push({
      ID: betId,
      MatchID: matchId,
      Map: 0,
      Name: name,
      MarketCode: marketCode,
      Line: b.line,
      HomeID: betId * 10 + 1,
      HomeName: isTotals ? "大" : home,
      AwayID: betId * 10 + 2,
      AwayName: isTotals ? "小" : away,
      Sources: { OB: src },
    });
  }
  if (!bets.length)
    return null;
  return {
    ID: matchId,
    Title: `${home} vs ${away}`,
    Game: game,
    GameID: 0,
    StartTime: startTime || Date.now(),
    Matchs: { OB: mid },
    Bets: bets,
  };
}

function marketsFromRow(mid, row) {
  if (!row)
    return [];
  const mapped = playsFromObMatchRow(row).flatMap(p => extractObPlaySelections(p)).filter(r => r.selections.length).map(r => ({
    mid,
    hpid: r.hpid,
    MarketCode: r.marketCode,
    Name: r.name,
    Line: r.line,
    Period: r.period,
    Selections: r.selections.map(s => ({
      Side: s.side,
      Name: s.name,
      Odds: s.odds,
      OddID: s.oid,
    })),
  }));
  return mergeMarketRows([mapped]);
}

function mergeMarketRows(lists) {
  /** @type {object[]} */
  const out = [];
  const seen = new Set();
  for (const r of lists.flat()) {
    const oidKey = (r.Selections || []).map(s => s.OddID || s.Name).join(",");
    const key = `${r.hpid}|${r.MarketCode}|${r.Line}|${r.Name}|${oidKey}`;
    if (seen.has(key))
      continue;
    seen.add(key);
    out.push(r);
  }
  return out;
}

/**
 * 展开一场：详情 playData（实测一场可 40+ 玩法）+ 列表 hpsAdd 补线。
 * 不进 GetFootballMatchs 热路径。
 * @param {string} mid
 */
export async function fetchObFootballMatchMarkets(mid) {
  const session = readSportObSession();
  if (!session?.token || !gatewayOrigin(session))
    return [];
  const id = String(mid || "").trim();
  if (!id)
    return [];
  let detailRow = null;
  try {
    detailRow = await fetchOddsDetailByMid(session, id);
  }
  catch (err) {
    console.warn("[sportObFootball] match markets detail", err?.message || err);
  }
  let rows = marketsFromRow(id, detailRow);
  try {
    const map = await fetchOddsByMids(session, [id]);
    rows = mergeMarketRows([rows, marketsFromRow(id, map.get(id) || null)]);
  }
  catch (err) {
    console.warn("[sportObFootball] match markets list fallback", err?.message || err);
  }
  const RICH = 12;
  const playIds = [
    ...await fetchCategoryPlayIds(session, id),
    ...playIdsFromRow(detailRow),
  ].filter((p, i, arr) => p && arr.indexOf(p) === i);
  const have = new Set(rows.map(r => String(r.hpid || "")));
  const missing = playIds.filter(p => !have.has(p));
  if (missing.length && rows.length < RICH) {
    try {
      const extra = await postPb(session, DETAIL_ODDS_PATH, {
        cuid: sportCuid(session),
        cos: 0,
        orpt: 0,
        euid: EUID_FOOTBALL,
        mid: id,
        mcid: 0,
        newUser: 0,
        hps: missing.join(","),
      });
      rows = mergeMarketRows([rows, marketsFromRow(id, matchRowFromDecoded(extra))]);
    }
    catch (err) {
      console.warn("[sportObFootball] match markets hps", err?.message || err);
    }
  }
  const still = playIds.filter(p => !new Set(rows.map(r => String(r.hpid || ""))).has(p)).slice(0, 24);
  if (still.length && rows.length < RICH) {
    let canaryOk = false;
    try {
      const extra = marketsFromRow(id, await fetchOddsByHpid(session, id, still[0]));
      if (extra.length) {
        canaryOk = true;
        rows = mergeMarketRows([rows, extra]);
      }
    }
    catch (err) {
      console.warn("[sportObFootball] play odds canary", still[0], err?.message || err);
    }
    if (canaryOk) {
      for (const hpid of still.slice(1)) {
        try {
          rows = mergeMarketRows([rows, marketsFromRow(id, await fetchOddsByHpid(session, id, hpid))]);
        }
        catch (err) {
          console.warn("[sportObFootball] play odds", hpid, err?.message || err);
          if (isRateLimited(err))
            break;
        }
        await sleep(80);
      }
    }
  }
  return rows;
}

async function doFetch() {
  const session = readSportObSession();
  if (!session?.token)
    return [];
  if (!gatewayOrigin(session)) {
    console.warn("[sportObFootball] session has token but no gateway");
    return [];
  }
  const schedule = await fetchSchedule(session);
  const mids = schedule.map(m => m.mid).filter(Boolean);
  const oddsMap = await fetchOddsByMids(session, mids);
  /** @type {object[]} */
  const dtos = [];
  for (const meta of schedule) {
    const odds = oddsMap.get(meta.mid);
    if (!odds)
      continue;
    const dto = buildDto(meta, odds);
    if (dto)
      dtos.push(dto);
  }
  dtos.sort((a, b) => (Number(a.StartTime) || 0) - (Number(b.StartTime) || 0));
  console.info(
    `[sportObFootball] schedule=${schedule.length} odds=${oddsMap.size} dtos=${dtos.length}`,
  );
  return dtos;
}

function readCachedRows() {
  if (memCache?.rows?.length)
    return memCache;
  const disk = readSportListCache(CACHE_KEY);
  if (disk?.rows?.length) {
    memCache = { at: disk.at, rows: disk.rows };
    return memCache;
  }
  return null;
}

function startFetch() {
  if (inflight)
    return inflight;
  inflight = (async () => {
    try {
      const rows = await doFetch();
      if (rows.length) {
        memCache = { at: Date.now(), rows };
        try {
          writeSportListCache(CACHE_KEY, rows);
        }
        catch (err) {
          console.warn("[sportObFootball] disk cache write", err?.message || err);
        }
      }
      else {
        console.warn("[sportObFootball] fetch returned 0 rows, skip cache");
      }
      return rows;
    }
    catch (err) {
      const stale = readSportListCache(CACHE_KEY);
      if (stale?.rows?.length) {
        console.warn("[sportObFootball] fetch failed, use disk cache", err?.message || err);
        memCache = { at: stale.at, rows: stale.rows };
        return stale.rows;
      }
      throw err;
    }
    finally {
      inflight = null;
    }
  })();
  return inflight;
}

/** @returns {Promise<object[]>} ClientMatchDto[] */
export async function fetchObFootballAsClientMatchDtos() {
  const session = readSportObSession();
  if (!session?.token)
    return [];
  const cached = readCachedRows();
  const age = cached ? Date.now() - cached.at : Infinity;
  if (cached?.rows?.length && age < CACHE_TTL_MS)
    return cached.rows;
  if (cached?.rows?.length && age < SPORT_DISK_TTL_MS) {
    void startFetch().catch(err => {
      console.warn("[sportObFootball] background refresh", err?.message || err);
    });
    return cached.rows;
  }
  return startFetch();
}

export function clearObFootballMatchCache() {
  memCache = null;
  inflight = null;
  try {
    clearSportListCache(CACHE_KEY);
    clearSportListCache("soccer_ob_v2");
    clearSportListCache("soccer_ob");
  }
  catch (err) {
    console.warn("[sportObFootball] clear cache", err?.message || err);
  }
}
