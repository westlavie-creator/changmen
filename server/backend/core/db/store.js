import * as sb from "@changmen/db";
import {
  accountsMultiplyNeedsPersist,
  normalizeAccountList,
} from "@changmen/shared/account_multiply";
import { normalizeEpochMs } from "@changmen/shared/time/match_time";
import { isEmbeddedMatcher } from "../shared/matcher_mode.js";

// ─── 内存 profile 缓存 ───────────────────────────────────────────────
const _cache = new Map();

function _set(uid, row) {
  _cache.set(String(uid), row);
}
function _get(uid) {
  return _cache.get(String(uid)) || null;
}

function _toProfile(row) {
  if (!row)
    return null;
  let setting = {};
  try {
    const bc = row.betting_config;
    setting = typeof bc === "object" && bc !== null ? bc : JSON.parse(bc || "{}");
  }
  catch {
    /* ignore */
  }
  return {
    id: String(row.id),
    userName: row.user_name,
    isAdmin: Boolean(row.is_admin),
    role: row.role || (row.is_admin ? "admin" : "user"),
    teamId: row.team_id || null,
    setting,
  };
}

// ─── profiles ────────────────────────────────────────────────────────

export function getProfileById(uid) {
  return _toProfile(_get(uid));
}

export function getProfileByName(userName) {
  for (const row of _cache.values()) {
    if (row.user_name === userName)
      return _toProfile(row);
  }
  return null;
}

export function listProfiles() {
  return [..._cache.values()].map(_toProfile).filter(Boolean);
}

/** 含 preferences 等完整行，供在线状态等管理端逻辑使用 */
export function listProfileRows() {
  return [..._cache.values()];
}

export function upsertProfile(profile) {
  const uid = String(profile.id);
  const existing = _get(uid) || {};
  _set(uid, {
    ...existing,
    id: uid,
    user_name: String(profile.userName || profile.user_name || existing.user_name || ""),
    accounts: profile.accounts ?? existing.accounts ?? [],
    betting_config: profile.betting_config ?? existing.betting_config ?? {},
    collect_config: profile.collect_config ?? existing.collect_config ?? {},
    preferences: profile.preferences ?? existing.preferences ?? {},
    created_at: profile.created_at || existing.created_at || Date.now(),
    updated_at: Date.now(),
  });
}

export function updateProfileSetting(uid, patch) {
  const row = _get(uid) || {};
  const bc
    = typeof row.betting_config === "object" && row.betting_config !== null
      ? { ...row.betting_config }
      : {};
  Object.assign(bc, patch || {});
  const now = Date.now();
  _set(uid, { ...row, betting_config: bc, updated_at: now });
  sb.writeProfile(uid, { betting_config: bc });
  return getProfileById(uid);
}

export async function loadProfileById(uid) {
  const data = await sb.fetchProfileById(uid);
  if (!data)
    return null;
  _set(data.id, data);
  return _toProfile(data);
}

export async function pullProfilesFromDb() {
  const profiles = await sb.fetchProfiles();
  if (profiles.length) {
    for (const p of profiles) _set(p.id, p);
    console.log("[db] 加载 profiles:", profiles.length, "条");
  }
}

// ─── accounts ────────────────────────────────────────────────────────

export function listAccountsForUser(uid) {
  const row = _get(uid);
  if (!row)
    return [];
  const a = row.accounts;
  let raw;
  if (Array.isArray(a)) {
    raw = a;
  }
  else {
    try {
      raw = JSON.parse(a || "[]");
    }
    catch {
      raw = [];
    }
  }
  const normalized = normalizeAccountList(raw);
  if (accountsMultiplyNeedsPersist(raw, normalized)) {
    _set(uid, { ...row, accounts: normalized, updated_at: Date.now() });
    sb.writeAccounts(uid, normalized);
  }
  return normalized;
}

/** 内存 accounts 为空时从 RDS 回源（手动恢复 profile 后无需重启 backend） */
export async function refreshAccountsFromRdsIfEmpty(uid) {
  const id = String(uid);
  const current = listAccountsForUser(id);
  if (current.length > 0)
    return current;
  const data = await sb.fetchProfileById(id);
  if (!data)
    return [];
  const raw = Array.isArray(data.accounts) ? data.accounts : [];
  if (!raw.length)
    return [];
  _set(id, { ...data, accounts: normalizeAccountList(raw) });
  return listAccountsForUser(id);
}

export function countAccounts() {
  return [..._cache.values()].reduce(
    (s, r) => s + (Array.isArray(r.accounts) ? r.accounts.length : 0),
    0,
  );
}

export function replaceAccountsForUser(uid, accounts) {
  const row = _get(uid) || {};
  const normalized = normalizeAccountList(accounts);
  _set(uid, { ...row, accounts: normalized, updated_at: Date.now() });
  sb.writeAccounts(uid, normalized);
  return listAccountsForUser(uid);
}

export function updateAccountForUser(uid, accountId, updates) {
  const accounts = listAccountsForUser(uid);
  const idx = accounts.findIndex(a => String(a.accountId) === String(accountId));
  if (idx < 0)
    return null;
  accounts[idx] = { ...accounts[idx], ...updates, updateTime: Date.now() };
  replaceAccountsForUser(uid, accounts);
  return accounts[idx];
}

export function removeAccountForUser(uid, accountId) {
  const accounts = listAccountsForUser(uid);
  const next = accounts.filter(a => String(a.accountId) !== String(accountId));
  if (next.length === accounts.length)
    return false;
  replaceAccountsForUser(uid, next);
  return true;
}

// ─── user_settings ───────────────────────────────────────────────────

function _colForKey(key) {
  if (key === "USERCONFIG")
    return "betting_config";
  if (key === "CollectConfig")
    return "collect_config";
  return "preferences";
}

export function setUserSetting(uid, key, content) {
  const col = _colForKey(key);
  const row = _get(uid) || {};
  const now = Date.now();
  if (col !== "preferences") {
    let parsed = {};
    try {
      parsed = JSON.parse(String(content ?? "{}"));
    }
    catch {
      /* ignore */
    }
    _set(uid, { ...row, [col]: parsed, updated_at: now });
    sb.writeProfile(uid, { [col]: parsed });
  }
  else {
    const prefs
      = typeof row.preferences === "object" && row.preferences !== null
        ? { ...row.preferences }
        : {};
    prefs[String(key)] = String(content ?? "");
    _set(uid, { ...row, preferences: prefs, updated_at: now });
    sb.writeProfile(uid, { preferences: prefs });
  }
}

export function getUserSetting(uid, key) {
  const col = _colForKey(key);
  const row = _get(uid);
  if (!row)
    return null;
  if (col !== "preferences") {
    const val = row[col];
    if (!val || (typeof val === "object" && !Object.keys(val).length))
      return null;
    return typeof val === "string" ? val : JSON.stringify(val);
  }
  const prefs = row.preferences || {};
  const val = typeof prefs === "object" ? prefs[String(key)] : null;
  return val != null ? String(val) : null;
}

export function countUserSettings() {
  return 0;
}

// ─── client_matches（内存 + built_at 快照缓存）────────────────────────

const _clientMatches = new Map();
/** matcher matchMerge 写入的 built_at + 行数；未变则 Client_GetMatchs 跳过重载 */
let _matchesCacheKey = "";
let _matchesCacheLoadedAt = 0;
/** archive 删行等 built_at 不变时的兜底全量刷新 */
const MATCHES_CACHE_MAX_AGE_MS = 90_000;

function _matchesCacheSignature(meta) {
  if (!meta)
    return "";
  const rev = Number(meta.pmSportRev) || 0;
  return `${meta.builtAt}:${meta.count}:${rev}`;
}

function _invalidateClientMatchesCache() {
  _matchesCacheKey = "";
  _matchesCacheLoadedAt = 0;
}

function _applyClientMatchRows(data) {
  if (!data?.length) {
    _clientMatches.clear();
    return null;
  }
  const now = Date.now();
  _clientMatches.clear();
  for (const row of data) {
    _clientMatches.set(Number(row.id), {
      ID: Number(row.id) || 0,
      Title: row.title || "",
      Game: row.game || "",
      GameID: Number(row.game_id) || 0,
      StartTime: normalizeEpochMs(row.start_time),
      BO: Number(row.bo) || 0,
      Round: Number(row.round) || 0,
      RoundStart: normalizeEpochMs(row.round_start),
      Reverse: Array.isArray(row.reverse) ? row.reverse : [],
      Matchs: row.matchs || {},
      Bets: row.bets || [],
      HomeGbTeamId: row.home_gb_team_id != null ? row.home_gb_team_id : undefined,
      AwayGbTeamId: row.away_gb_team_id != null ? row.away_gb_team_id : undefined,
      PmSport: row.pm_sport && typeof row.pm_sport === "object" ? row.pm_sport : undefined,
      built_at: row.built_at || now,
    });
  }
  return getClientMatches();
}

export function saveClientMatches(info) {
  if (!Array.isArray(info) || !info.length)
    return;
  const now = Date.now();
  _invalidateClientMatchesCache();
  _clientMatches.clear();
  for (const m of info) _clientMatches.set(Number(m.ID), { ...m, built_at: now });
  sb.writeClientMatches(
    info.map(m => ({
      id: Number(m.ID),
      merge_key: m.MergeKey ? String(m.MergeKey) : null,
      title: String(m.Title || ""),
      game: String(m.Game || ""),
      game_id: String(m.GameID || ""),
      start_time: Number(m.StartTime) || 0,
      bo: Number(m.BO) || 0,
      round: Number(m.Round) || 0,
      round_start: Number(m.RoundStart) || 0,
      reverse: Array.isArray(m.Reverse) ? m.Reverse : [],
      matchs: m.Matchs || {},
      bets: m.Bets || [],
      home_gb_team_id: m.HomeGbTeamId ?? null,
      away_gb_team_id: m.AwayGbTeamId ?? null,
      built_at: now,
    })),
  );
}

export function dropOrphanClientMatchesFromMemory(activeIds) {
  if (!activeIds?.length) {
    _clientMatches.clear();
    _invalidateClientMatchesCache();
    return;
  }
  const active = new Set(activeIds.map(Number));
  for (const id of _clientMatches.keys()) {
    if (!active.has(id))
      _clientMatches.delete(id);
  }
}

export function getClientMatches() {
  if (!_clientMatches.size)
    return null;
  return [..._clientMatches.values()].sort(
    (a, b) => (a.StartTime || 0) - (b.StartTime || 0),
  );
}

/** embedded matchMerge 完成后同步内存（RDS 已由 writeClientMatchesAsync 写入） */
export function setClientMatchesFromMatchMerge(info, builtAt = Date.now()) {
  const ts = Number(builtAt) || Date.now();
  const list = Array.isArray(info) ? info : [];
  const pmById = new Map();
  for (const [id, m] of _clientMatches) {
    if (m.PmSport)
      pmById.set(id, m.PmSport);
  }
  _clientMatches.clear();
  for (const m of list) {
    const id = Number(m.ID);
    _clientMatches.set(id, {
      ...m,
      PmSport: m.PmSport ?? pmById.get(id),
      built_at: ts,
    });
  }
  _invalidateClientMatchesCache();
}

/** 人工归档后从内存移除，避免 embedded matchMerge 仍读到已归档行 */
export function removeClientMatchFromMemory(clientMatchId) {
  const id = Number(clientMatchId);
  if (!Number.isFinite(id))
    return;
  _clientMatches.delete(id);
}

/** 人工主客反转后同步内存，避免 embedded 快照 / matchMerge 仍用旧 Reverse */
export function patchClientMatchPlatformReverseInMemory(clientMatchId, platform, reversed) {
  const id = Number(clientMatchId);
  const plat = String(platform || "").trim();
  if (!Number.isFinite(id) || !plat)
    return false;
  const m = _clientMatches.get(id);
  if (!m)
    return false;
  const reverseSet = new Set(Array.isArray(m.Reverse) ? m.Reverse.map(String) : []);
  if (reversed)
    reverseSet.add(plat);
  else
    reverseSet.delete(plat);
  const matchPlatforms = new Set(Object.keys(m.Matchs || {}));
  m.Reverse = [...reverseSet].filter(p => matchPlatforms.has(p));
  _invalidateClientMatchesCache();
  return true;
}

/** matcher align / 内存快照：RDS 行形状 */
export function getClientMatchRowsForSnapshot() {
  if (!_clientMatches.size)
    return [];
  return [..._clientMatches.values()].map(m => ({
    id: Number(m.ID),
    merge_key: m.MergeKey != null ? String(m.MergeKey) : null,
    title: String(m.Title || ""),
    game: String(m.Game || ""),
    game_id: String(m.GameID || ""),
    start_time: Number(m.StartTime) || 0,
    bo: Number(m.BO) || 0,
    round: Number(m.Round) || 0,
    round_start: Number(m.RoundStart) || 0,
    reverse: Array.isArray(m.Reverse) ? m.Reverse : [],
    matchs: m.Matchs || {},
    bets: m.Bets || [],
    home_gb_team_id: m.HomeGbTeamId ?? null,
    away_gb_team_id: m.AwayGbTeamId ?? null,
    built_at: Number(m.built_at) || 0,
  }));
}

/**
 * 从 RDS 加载 client_matches。
 * built_at + 行数未变时复用内存快照，避免多用户轮询重复 SELECT *。
 */
export async function loadClientMatchesFromDb() {
  const now = Date.now();
  const cacheStale
    = !_matchesCacheLoadedAt || now - _matchesCacheLoadedAt > MATCHES_CACHE_MAX_AGE_MS;

  if (isEmbeddedMatcher() && _clientMatches.size && _matchesCacheKey && !cacheStale) {
    const meta = await sb.fetchClientMatchesMeta();
    if (meta && _matchesCacheSignature(meta) === _matchesCacheKey)
      return getClientMatches();
  }

  if (_clientMatches.size && _matchesCacheKey && !cacheStale) {
    const meta = await sb.fetchClientMatchesMeta();
    if (meta && _matchesCacheSignature(meta) === _matchesCacheKey) {
      return getClientMatches();
    }
  }

  const data = await sb.fetchClientMatches();
  // null = 查询失败，暂用内存兜底；[] = 库确认为空，清掉遗留内存（避免 archive 后仍返回旧列表）
  if (data === null)
    return _clientMatches.size ? getClientMatches() : null;
  if (!data.length) {
    _clientMatches.clear();
    _matchesCacheKey = "0:0";
    _matchesCacheLoadedAt = now;
    return null;
  }

  const builtAt = data.reduce(
    (max, row) => Math.max(max, Number(row.built_at) || 0),
    0,
  );
  const meta = await sb.fetchClientMatchesMeta();
  _matchesCacheKey = meta
    ? _matchesCacheSignature(meta)
    : `${builtAt}:${data.length}:0`;
  _matchesCacheLoadedAt = now;
  return _applyClientMatchRows(data);
}
