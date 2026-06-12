import fs from "node:fs";
import path from "node:path";
import { ESPORT_DATA_DIR } from "../shared/storage_paths.js";
import { formatBetOdds } from "../../../../packages/shared/odds_format.js";
import { a8StartTimeListAllowed } from "../../../../packages/shared/time/match_time.mjs";
import { createDefaultOddsApi } from "./default_odds.js";
import * as dbStore from "../db/store.js";
import * as sb from "../../../../packages/shared/db/supabase.js";
import {
  overlayLiveTimersOnMatches,
  mergeTimerBlocks,
} from "./live_timer_overlay.js";

const DATA_DIR = ESPORT_DATA_DIR;
// 内存缓存（替代 matches.json / bets.json / live_timers.json）
const _matches = {}; // { [provider]: { [matchId]: matchData } }
const _bets = {}; // { [provider:matchId]: { provider, matchId, bets } }
const _timers = {}; // { [provider]: { provider, timer } }

function filePath(name) {
  return path.join(DATA_DIR, `${name}.json`);
}

function readJson(name, fallback) {
  const fp = filePath(name);
  try {
    if (!fs.existsSync(fp)) return fallback;
    return JSON.parse(fs.readFileSync(fp, "utf8"));
  } catch {
    return fallback;
  }
}

function writeJson(name, data) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.writeFileSync(filePath(name), JSON.stringify(data, null, 2), "utf8");
}

const defaultOddsApi = createDefaultOddsApi(readJson, writeJson);

const DEFAULT_USER_KV = {
  CollectConfig: JSON.stringify({ log: false, collect: [] }),
  USERCONFIG: JSON.stringify({
    betting: false,
    betMoney: 100,
    profit: 1.03,
    maxProfit: 1.2,
    minOdds: 1.3,
    maxOdds: 10,
    betSorting: "Custom",
  }),
  ACCOUNT: JSON.stringify([]),
};

// 路由到 Supabase profiles 的 key 列表（与 DEFAULT_USER_KV 解耦）
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

// ── 初始化 JSON 文件（不创建用户，用户通过 Supabase Auth 管理）──────────────
export function ensureSeed() {
  const jsonDefaults = {
    platforms: {},
    tag_platforms: {},
  };
  for (const [name, def] of Object.entries(jsonDefaults)) {
    if (!fs.existsSync(filePath(name))) writeJson(name, def);
  }
}

// ── Auth：token → profile（鉴权逻辑在 packages/shared/db/supabase.js）────────
export async function getUserBySupabaseToken(token) {
  if (!token) return null;

  const auth = await sb.authGetUser(token);
  if (!auth?.userId) return null;

  let profile = dbStore.getProfileById(auth.userId);
  if (!profile) profile = await dbStore.loadProfileById(auth.userId);
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
  return readJson("platforms", {})[provider] || null;
}

export function setPlatform(provider, data) {
  const platforms = readJson("platforms", {});
  platforms[provider] = {
    ...platforms[provider],
    ...data,
    provider,
    updatedAt: Date.now(),
  };
  writeJson("platforms", platforms);
  return platforms[provider];
}

// ── matches / bets ────────────────────────────────────────────────────────────
function pruneBetsForProvider(provider, activeMatchIds) {
  const active = new Set(activeMatchIds.map(String));
  const prefix = `${provider}:`;
  for (const key of Object.keys(_bets)) {
    if (!key.startsWith(prefix)) continue;
    if (!active.has(key.slice(prefix.length))) delete _bets[key];
  }
}

export function saveMatches(provider, matchs) {
  const now = Date.now();
  const next = {};
  const list = Array.isArray(matchs) ? matchs : [];
  const prev = _matches[provider];
  if (!list.length && prev && typeof prev === "object" && Object.keys(prev).length > 0)
    return;
  for (const m of list) {
    if (!m || m.SourceMatchID == null) continue;
    const start = Number(m.StartTime || 0);
    if (start > 0 && !a8StartTimeListAllowed(start)) continue;
    next[String(m.SourceMatchID)] = { ...m, provider, savedAt: now };
  }
  _matches[provider] = next;
  pruneBetsForProvider(provider, Object.keys(next));
  sb.writePlatformMatches(provider, Object.values(next));
}

/** [A8 可证实] 客户端每次 saveBets 上报该场完整盘口快照，服务端整包替换（非按 Map 增量合并） */
function normalizeSaveBetRows(bets) {
  return (bets || [])
    .filter((b) => b && b.SourceBetID != null && !String(b.BetName ?? "").includes("+"))
    .map(formatBetOdds)
    .sort((a, b) => (a.Map ?? 0) - (b.Map ?? 0));
}

export function saveBets(provider, matchId, bets) {
  const key = `${provider}:${matchId}`;
  const existing = _bets[key]?.bets || [];
  const raw = Array.isArray(bets) ? bets : [];
  const incoming = normalizeSaveBetRows(raw);
  if (incoming.length === 0) {
    // [A8 可证实] 空数组 saveBets 不覆盖内存已有盘口；Supabase 刷新 updated_at 避免 matcher 空窗
    if (existing.length > 0) {
      sb.writePlatformBets(provider, matchId, existing);
      return;
    }
    _bets[key] = { provider, matchId: String(matchId), bets: [], savedAt: Date.now() };
    return;
  }
  _bets[key] = { provider, matchId: String(matchId), bets: incoming, savedAt: Date.now() };
  sb.replacePlatformBetsForMatch(provider, matchId, incoming);
}

export function saveLiveTimer(provider, timer) {
  _timers[provider] = { provider, timer, savedAt: Date.now() };
  sb.writeLiveTimers(provider, timer);
}

// ── user kv / settings ────────────────────────────────────────────────────────
export function isUserSettingKey(key) {
  return USER_SETTING_KEYS.includes(key);
}

export function getUserSetting(userId, key) {
  if (!isUserSettingKey(key)) return null;
  return dbStore.getUserSetting(userId, key);
}

export function setUserSetting(userId, key, content) {
  if (!isUserSettingKey(key)) return;
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

let _dbTimersCache = null;
let _dbTimersCacheAt = 0;
const DB_TIMERS_CACHE_MS = 10_000;

async function fetchDbTimersCached() {
  const now = Date.now();
  if (_dbTimersCache && now - _dbTimersCacheAt < DB_TIMERS_CACHE_MS) {
    return _dbTimersCache;
  }
  try {
    _dbTimersCache = (await sb.fetchLiveTimers()) || {};
  } catch {
    _dbTimersCache = {};
  }
  _dbTimersCacheAt = now;
  return _dbTimersCache;
}

export async function buildMatchList() {
  // 只读 client_matches（gamebet_matcher rebuild 写入）；不在此做跨平台合并
  const fromDb = await dbStore.loadClientMatchesFromSupabase();
  if (!fromDb?.length) return [];

  const dbTimers = await fetchDbTimersCached();
  const timers = mergeTimerBlocks(_timers, dbTimers);
  return overlayLiveTimersOnMatches(fromDb, timers);
}

export function getMatchDefaultOdds(matchIds) {
  return defaultOddsApi.getMatchDefaultOdds(matchIds, () => buildMatchList());
}
export function getDefaultOddsSingle(betId, team) {
  return defaultOddsApi.getDefaultOddsSingle(betId, team, () => buildMatchList());
}
export function parseKvContent(raw) {
  if (raw == null || raw === "") return null;
  try {
    return JSON.parse(raw);
  } catch {
    return raw;
  }
}

export { DATA_DIR, readJson, writeJson };

const store = {
  DATA_DIR,
  ensureSeed,
  getUserBySupabaseToken,
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
  getMatchDefaultOdds,
  getDefaultOddsSingle,
  readJson,
  writeJson,
};

export default store;
