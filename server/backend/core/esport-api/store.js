import * as sb from "@changmen/db";
import { normalizeMatchesShape } from "@changmen/match-engine";
import { alignPmSportSnapshot } from "@changmen/polymarket-sports/parse_sport.js";
import { formatBetOdds } from "@changmen/shared/odds_format";
import { a8StartTimeListAllowed } from "@changmen/shared/time/match_time";
import { readJsonFile, writeJsonFile, writeJsonFileDebounced } from "@changmen/storage/json_file_store.js";
import {
  ensureStorageSeed,
  getPlatform as getPlatformRow,
  setPlatform as setPlatformRow,
} from "@changmen/storage/platform_storage.js";
import * as dbStore from "../db/store.js";
import { isEmbeddedMatcher } from "../shared/matcher_mode.js";
import { ESPORT_DATA_DIR } from "../shared/storage_paths.js";
import { createDefaultOddsApi } from "./default_odds.js";
import {
  applyObLiveGate,
  mergeTimerBlocks,
  overlayLiveTimersOnMatches,
} from "./live_timer_overlay.js";

const DATA_DIR = ESPORT_DATA_DIR;
// 内存缓存（替代 matches.json / bets.json / live_timers.json）
const _matches = {}; // { [provider]: { [matchId]: matchData } }
const _bets = {}; // { [provider:matchId]: { provider, matchId, bets } }
const _timers = {}; // { [provider]: { provider, timer } }

const readJson = readJsonFile;
const writeJson = writeJsonFile;

const defaultOddsApi = createDefaultOddsApi(readJson, writeJson, {
  writeDebounced: (name, data) => writeJsonFileDebounced(name, data, 5000),
});

function cloneJson(value) {
  if (value == null)
    return value;
  if (typeof structuredClone === "function")
    return structuredClone(value);
  return JSON.parse(JSON.stringify(value));
}

const COLLECTOR_HOT_CACHE_TTL_MS = Number(process.env.COLLECTOR_HOT_CACHE_TTL_MS || 180_000);
let _dbTimersCache = null;
let _dbTimersCacheAt = 0;
const DB_TIMERS_CACHE_MS = 10_000;

// 路由到 profiles 的 key 列表
// CollectConfig → collect_config, USERCONFIG → betting_config, 其余 → preferences
const USER_SETTING_KEYS = [
  "CollectConfig",
  "USERCONFIG",
  "Follow",
  "PROXY",
  "GoogleCode",
  "Wallet",
  "Message",
];

// ── 初始化 JSON 文件 ───────────────────────────────────────────────────────
export function ensureSeed() {
  ensureStorageSeed();
}

// ── Auth：token → profile（鉴权逻辑在 @changmen/db）────────
export async function getUserByToken(token) {
  if (!token)
    return null;

  const auth = await sb.authGetUser(token);
  if (!auth?.userId)
    return null;

  let profile = dbStore.getProfileById(auth.userId);
  if (!profile)
    profile = await dbStore.loadProfileById(auth.userId);
  return profile || null;
}

// ── profile ───────────────────────────────────────────────────────────────────
export function getUserById(uid) {
  return dbStore.getProfileById(uid);
}

export function updateUserSetting(uid, patch) {
  return dbStore.updateProfileSetting(uid, patch);
}

// ── platform ──────────────────────────────────────────────────────────────────
export function getPlatform(provider) {
  return getPlatformRow(provider);
}

export function setPlatform(provider, data) {
  return setPlatformRow(provider, data);
}

function dropOrphanBetsForProvider(provider, activeMatchIds) {
  const active = new Set(activeMatchIds.map(String));
  const prefix = `${provider}:`;
  for (const key of Object.keys(_bets)) {
    if (!key.startsWith(prefix))
      continue;
    if (!active.has(key.slice(prefix.length)))
      delete _bets[key];
  }
}

function linkedClientMatchId(row) {
  if (!row || typeof row !== "object")
    return null;
  const raw = row.ClientMatchId ?? row.client_match_id ?? row.match_id;
  if (raw == null || raw === "")
    return null;
  const id = Number(raw);
  return Number.isFinite(id) ? id : null;
}

export function saveMatches(provider, matchs) {
  const now = Date.now();
  const next = {};
  const list = Array.isArray(matchs) ? matchs : [];
  const prev = _matches[provider];
  // [A8 可证实] SaveMatch 为全量快照：空数组 = 该平台当前无可见赛（与 collectStore 对齐）
  for (const m of list) {
    if (!m || m.SourceMatchID == null)
      continue;
    const start = Number(m.StartTime || 0);
    if (start > 0 && !a8StartTimeListAllowed(start))
      continue;
    const sid = String(m.SourceMatchID);
    const prevRow = prev?.[sid];
    const linkedId = linkedClientMatchId(m) ?? linkedClientMatchId(prevRow);
    next[sid] = {
      ...m,
      provider,
      savedAt: now,
      ...(linkedId != null
        ? { ClientMatchId: linkedId, client_match_id: linkedId, match_id: linkedId }
        : {}),
    };
  }
  _matches[provider] = next;
  dropOrphanBetsForProvider(provider, Object.keys(next));
  sb.writePlatformMatches(provider, Object.values(next));
  invalidatePlatformEnrichCache();
}

/** matchMerge 完成后把 client_matches.matchs 回写到采集内存，避免下轮 align 重复 */
export function patchCollectorMatchClientIds(clientRows) {
  if (!Array.isArray(clientRows))
    return;
  for (const cm of clientRows) {
    const cmId = Number(cm.ID ?? cm.id);
    if (!Number.isFinite(cmId))
      continue;
    const links = cm.Matchs || cm.matchs || {};
    for (const [plat, srcId] of Object.entries(links)) {
      const row = _matches[plat]?.[String(srcId)];
      if (!row)
        continue;
      row.ClientMatchId = cmId;
      row.client_match_id = cmId;
      row.match_id = cmId;
    }
  }
}

/** 比赛已结束 / 人工归档：从采集内存移除平台行（与 RDS deletePlatformMatchRow 同步） */
export function removeCollectorPlatformMatch(platform, sourceMatchId) {
  const plat = String(platform || "").trim();
  const sid = String(sourceMatchId ?? "").trim();
  if (!plat || !sid)
    return;
  const bucket = _matches[plat];
  if (bucket && sid in bucket)
    delete bucket[sid];
  if (bucket && !Object.keys(bucket).length)
    delete _matches[plat];
  delete _bets[`${plat}:${sid}`];
  invalidatePlatformEnrichCache();
  _dbTimersCache = null;
}

/** [A8 可证实] 客户端每次 saveBets 上报该场完整盘口快照，服务端整包替换（非按 Map 增量合并） */
function normalizeSaveBetRows(bets) {
  return (bets || [])
    .filter(b => b && b.SourceBetID != null && !String(b.BetName ?? "").includes("+"))
    .map(formatBetOdds)
    .sort((a, b) => (a.Map ?? 0) - (b.Map ?? 0));
}

export function saveBets(provider, matchId, bets) {
  const key = `${provider}:${matchId}`;
  const existing = _bets[key]?.bets || [];
  const raw = Array.isArray(bets) ? bets : [];
  const incoming = normalizeSaveBetRows(raw);
  if (incoming.length === 0) {
    // [A8 可证实] 空数组 saveBets 不覆盖内存已有盘口；RDS 刷新 updated_at 避免 matcher 空窗
    if (existing.length > 0) {
      sb.writePlatformBets(provider, matchId, existing);
      return;
    }
    _bets[key] = { provider, matchId: String(matchId), bets: [], savedAt: Date.now() };
    return;
  }
  _bets[key] = { provider, matchId: String(matchId), bets: incoming, savedAt: Date.now() };
  sb.replacePlatformBetsForMatch(provider, matchId, incoming);
  invalidatePlatformEnrichCache();
}

export async function saveLiveTimer(provider, timer) {
  _timers[provider] = {
    provider,
    timer: Array.isArray(timer) ? timer : [],
    savedAt: Date.now(),
  };
  _dbTimersCache = null;
  await sb.writeLiveTimersAsync(provider, timer);
}

// ── user kv / settings ────────────────────────────────────────────────────────
export function isUserSettingKey(key) {
  return USER_SETTING_KEYS.includes(key);
}

export function getUserSetting(userId, key) {
  if (!isUserSettingKey(key))
    return null;
  return dbStore.getUserSetting(userId, key);
}

export function setUserSetting(userId, key, content) {
  if (!isUserSettingKey(key))
    return;
  dbStore.setUserSetting(userId, key, content ?? "");
}

// ── accounts ──────────────────────────────────────────────────────────────────
export function getAccountsForUser(userId) {
  return dbStore.listAccountsForUser(userId);
}
export function setAccountsForUser(userId, accounts) {
  return dbStore.replaceAccountsForUser(userId, accounts);
}
export function updateAccountForUser(userId, accountId, updates) {
  return dbStore.updateAccountForUser(userId, accountId, updates);
}
export function removeAccountForUser(userId, accountId) {
  return dbStore.removeAccountForUser(userId, accountId);
}

// ── match list ────────────────────────────────────────────────────────────────

async function fetchDbTimersCached() {
  if (isEmbeddedMatcher()) {
    const fromMem = buildLiveTimersSnapshot();
    // 勿因 OB: { timer: [] } 占位跳过 RDS（部署 purge 后空快照会永久挡住 DB）
    if (hasNonEmptyLiveTimerSnapshot(fromMem)) {
      _dbTimersCache = fromMem;
      _dbTimersCacheAt = Date.now();
      return fromMem;
    }
  }
  const now = Date.now();
  if (_dbTimersCache && now - _dbTimersCacheAt < DB_TIMERS_CACHE_MS) {
    return _dbTimersCache;
  }
  try {
    _dbTimersCache = (await sb.fetchLiveTimers()) || {};
  }
  catch {
    _dbTimersCache = {};
  }
  _dbTimersCacheAt = now;
  return _dbTimersCache;
}

let _platformEnrichCache = null;
let _platformEnrichCacheAt = 0;
const PLATFORM_ENRICH_CACHE_MS = 5_000;

async function fetchPlatformEnrichCached() {
  const now = Date.now();
  if (_platformEnrichCache && now - _platformEnrichCacheAt < PLATFORM_ENRICH_CACHE_MS) {
    return _platformEnrichCache;
  }
  if (isEmbeddedMatcher()) {
    const matchesRaw = buildPlatformMatchesSnapshot();
    const bets = buildPlatformBetsSnapshot();
    if (Object.keys(matchesRaw).length || Object.keys(bets).length) {
      _platformEnrichCache = {
        bets,
        matches: normalizeMatchesShape(matchesRaw),
      };
      _platformEnrichCacheAt = now;
      return _platformEnrichCache;
    }
  }
  _platformEnrichCacheAt = now;
  try {
    const [platformBets, platformMatches] = await Promise.all([
      sb.fetchPlatformBets(),
      sb.fetchPlatformMatches(),
    ]);
    if (platformBets && platformMatches) {
      _platformEnrichCache = {
        bets: platformBets,
        matches: normalizeMatchesShape(platformMatches),
      };
    }
  }
  catch {
    /* 失败时保留旧缓存 */
  }
  return _platformEnrichCache;
}

export function invalidatePlatformEnrichCache() {
  _platformEnrichCache = null;
}

function buildPlatformMatchesSnapshot() {
  const matchesRaw = {};
  for (const [provider, rows] of Object.entries(_matches)) {
    const list = Object.values(rows || {});
    if (list.length)
      matchesRaw[provider] = cloneJson(list);
  }
  return matchesRaw;
}

function buildPlatformBetsSnapshot() {
  const bets = {};
  for (const [key, row] of Object.entries(_bets)) {
    if (row && Array.isArray(row.bets))
      bets[key] = cloneJson(row);
  }
  return bets;
}

function buildLiveTimersSnapshot() {
  const timers = {};
  for (const [provider, row] of Object.entries(_timers)) {
    if (row && Array.isArray(row.timer))
      timers[provider] = cloneJson(row);
  }
  return timers;
}

/** 至少一个平台 timer 数组非空；空数组仍占位时须回退 RDS（embedded 热路径） */
function hasNonEmptyLiveTimerSnapshot(timersByProvider) {
  return Object.values(timersByProvider || {}).some(
    block => Array.isArray(block?.timer) && block.timer.length > 0,
  );
}

/** embedded matcher：matchMerge / GetMatchs 读全量采集内存（不限 3 分钟 hot TTL） */
export function getCollectorFullSnapshot() {
  const matchesRaw = buildPlatformMatchesSnapshot();
  const bets = buildPlatformBetsSnapshot();
  const timers = buildLiveTimersSnapshot();
  return {
    matchesRaw,
    bets,
    timers,
    hasMatches: Object.keys(matchesRaw).length > 0,
    hasBets: Object.keys(bets).length > 0,
    hasTimers: Object.keys(timers).length > 0,
  };
}

export function getCollectorHotSnapshot() {
  const freshAfter = Date.now() - COLLECTOR_HOT_CACHE_TTL_MS;
  const matchesRaw = {};
  for (const [provider, rows] of Object.entries(_matches)) {
    const list = Object.values(rows || {}).filter(row => Number(row?.savedAt || 0) >= freshAfter);
    if (list.length)
      matchesRaw[provider] = cloneJson(list);
  }

  const bets = {};
  for (const [key, row] of Object.entries(_bets)) {
    if (row && Array.isArray(row.bets) && Number(row.savedAt || 0) >= freshAfter)
      bets[key] = cloneJson(row);
  }

  const timers = {};
  for (const [provider, row] of Object.entries(_timers)) {
    if (row && Array.isArray(row.timer) && Number(row.savedAt || 0) >= freshAfter)
      timers[provider] = cloneJson(row);
  }

  return {
    matchesRaw,
    bets,
    timers,
    hasMatches: Object.keys(matchesRaw).length > 0,
    hasBets: Object.keys(bets).length > 0,
    hasTimers: Object.keys(timers).length > 0,
  };
}

export function hydrateCollectorHotSnapshot({ matchesRaw = {}, bets = {}, timers = {} } = {}) {
  for (const [provider, rows] of Object.entries(matchesRaw || {})) {
    const next = {};
    for (const m of rows || []) {
      if (!m || m.SourceMatchID == null)
        continue;
      next[String(m.SourceMatchID)] = { ...m, provider, savedAt: Date.now() };
    }
    if (Object.keys(next).length)
      _matches[provider] = next;
  }
  for (const [key, row] of Object.entries(bets || {})) {
    if (row && Array.isArray(row.bets))
      _bets[key] = { ...row, savedAt: Date.now() };
  }
  for (const [provider, row] of Object.entries(timers || {})) {
    if (row && Array.isArray(row.timer))
      _timers[provider] = { ...row, savedAt: Date.now() };
  }
  invalidatePlatformEnrichCache();
  _dbTimersCache = null;
}

/** 仅当 OB index 明确 is_live≠2，或本场已从 getTimer 批次移除时清零 Round */
function applyObLiveGateOnMatches(matches, memoryMatches, timersByProvider) {
  return applyObLiveGate(matches, memoryMatches, timersByProvider);
}

function sourceFromBetForOverlay(provider, b) {
  return {
    Type: provider,
    BetID: String(b.SourceBetID),
    HomeID: String(b.SourceHomeID || ""),
    AwayID: String(b.SourceAwayID || ""),
    HomeOdds: formatBetOdds(b.HomeOdds),
    AwayOdds: formatBetOdds(b.AwayOdds),
    Status: b.Status || "Normal",
  };
}

export async function buildMatchList() {
  // 只读 client_matches（gamebet_matcher matchMerge 写入）；不在此做跨平台合并
  const fromDb = await dbStore.loadClientMatchesFromDb();
  if (!fromDb?.length)
    return [];

  const dbTimers = await fetchDbTimersCached();
  const timers = mergeTimerBlocks(_timers, dbTimers);
  defaultOddsApi.recordFromMatchList(fromDb);

  let enrich = {};
  const enrichData = await fetchPlatformEnrichCached();
  if (enrichData?.bets && enrichData?.matches) {
    enrich = {
      matches: enrichData.matches,
      bets: enrichData.bets,
      sourceFromBet: sourceFromBetForOverlay,
    };
  }

  let matches = overlayLiveTimersOnMatches(fromDb, timers, enrich);
  matches = applyObLiveGateOnMatches(matches, _matches, timers);
  matches = await overlayPmSportOnMatches(matches);
  defaultOddsApi.recordFromMatchList(matches);
  return matches;
}

/** 每次 GetMatchs 轻量补全 pm_sport（daemon 写入后不必等 matchMerge 全量重载） */
async function overlayPmSportOnMatches(matches) {
  if (!Array.isArray(matches) || !matches.length)
    return matches || [];
  const ids = matches.map(m => Number(m.ID)).filter(Number.isFinite);
  const pmById = await sb.fetchPmSportByClientMatchIds(ids);
  if (!pmById.size)
    return matches;
  return matches.map((m) => {
    const patch = pmById.get(Number(m.ID));
    if (!patch)
      return m;
    const reverse = Array.isArray(m.Reverse) ? m.Reverse : [];
    const pmSport = reverse.includes("Polymarket")
      ? alignPmSportSnapshot(patch, true)
      : patch;
    return { ...m, PmSport: pmSport };
  });
}

const fetchPlatformBetsForDefaultOdds = () => sb.fetchPlatformBets();

export function getMatchDefaultOdds(matchIds) {
  return defaultOddsApi.getMatchDefaultOdds(
    matchIds,
    () => buildMatchList(),
    fetchPlatformBetsForDefaultOdds,
  );
}
export function getDefaultOddsSingle(betId, team) {
  return defaultOddsApi.getDefaultOddsSingle(
    betId,
    team,
    () => buildMatchList(),
    fetchPlatformBetsForDefaultOdds,
  );
}
export function parseKvContent(raw) {
  if (raw == null || raw === "")
    return null;
  try {
    return JSON.parse(raw);
  }
  catch {
    return raw;
  }
}

export { DATA_DIR, readJson, writeJson };

const store = {
  DATA_DIR,
  ensureSeed,
  getUserByToken,
  getUserById,
  updateUserSetting,
  getPlatform,
  setPlatform,
  saveMatches,
  saveBets,
  saveLiveTimer,
  isUserSettingKey,
  getUserSetting,
  setUserSetting,
  getAccountsForUser,
  setAccountsForUser,
  updateAccountForUser,
  removeAccountForUser,
  parseKvContent,
  buildMatchList,
  getCollectorHotSnapshot,
  getCollectorFullSnapshot,
  hydrateCollectorHotSnapshot,
  patchCollectorMatchClientIds,
  removeCollectorPlatformMatch,
  getMatchDefaultOdds,
  getDefaultOddsSingle,
  readJson,
  writeJson,
};

export default store;
