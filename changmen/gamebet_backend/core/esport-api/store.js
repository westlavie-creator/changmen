"use strict";

const fs = require("fs");
const path = require("path");
const { ESPORT_DATA_DIR } = require("../shared/storage_paths.js");
const { buildClientMatchList } = require("./match_merge");
const { formatOdds, formatBetOdds } = require("../shared/odds_format.js");
const { a8StartTimeListAllowed } = require("../integrations/a8/match_time.js");
const { createDefaultOddsApi } = require("./default_odds.js");
const dbStore = require("../db/store.js");

const DATA_DIR = ESPORT_DATA_DIR;
const CLIENT_MATCHS_DEBOUNCE_MS = Number(process.env.ESPORT_CLIENT_MATCHS_DEBOUNCE_MS || 400);

let clientMatchsRebuildTimer = null;

// 内存缓存（替代 matches.json / bets.json / live_timers.json）
const _matches = {};   // { [provider]: { [matchId]: matchData } }
const _bets = {};      // { [provider:matchId]: { provider, matchId, bets } }
const _timers = {};    // { [provider]: { provider, timer } }

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
  USERCONFIG: JSON.stringify({ betting: false, betMoney: 100, profit: 1.03, maxProfit: 1.2, minOdds: 1.3, maxOdds: 10, betSorting: "Custom" }),
  ACCOUNT: JSON.stringify([]),
  PROXY: JSON.stringify([]),
  GoogleCode: JSON.stringify([]),
  Wallet: JSON.stringify([]),
  Message: JSON.stringify({ telegramId: "", pushOrderId: "" }),
  Follow: JSON.stringify({}),
};

const USER_SETTING_KEYS = Object.keys(DEFAULT_USER_KV).filter((k) => k !== "ACCOUNT");

// ── 初始化 JSON 文件（不创建用户，用户通过 Supabase Auth 管理）──────────────
function ensureSeed() {
  const jsonDefaults = {
    platforms: {},
    user_kv: { ...DEFAULT_USER_KV },
    tag_platforms: {},
  };
  for (const [name, def] of Object.entries(jsonDefaults)) {
    if (!fs.existsSync(filePath(name))) writeJson(name, def);
  }
  // 补充 user_kv 缺失的 key
  const kv = readJson("user_kv", {});
  let changed = false;
  for (const [key, val] of Object.entries(DEFAULT_USER_KV)) {
    if (kv[key] == null) { kv[key] = val; changed = true; }
  }
  if (changed) writeJson("user_kv", kv);
}

// ── Supabase Auth：用 JWT token 获取当前用户 profile ─────────────────────────
function getJwtClaim(token, claim) {
  try {
    return JSON.parse(Buffer.from(token.split(".")[1], "base64url").toString())[claim];
  } catch {
    return null;
  }
}

async function getUserBySupabaseToken(token) {
  if (!token) return null;
  const sb = require("../db/supabase.js");
  const result = await sb.authGetUser(token);
  if (!result) return null;

  // 单 session 校验：token 的 session_id 必须与登录时写入的 active_session_id 一致
  const storedSessionId = result.metadata?.active_session_id;
  if (storedSessionId) {
    const tokenSessionId = getJwtClaim(token, "session_id");
    if (tokenSessionId && tokenSessionId !== storedSessionId) {
      return null; // 已被新登录顶掉
    }
  }

  // 先查内存缓存，cache miss 时从 Supabase 加载
  let profile = dbStore.getProfileById(result.userId);
  if (!profile) {
    profile = await dbStore.loadProfileById(result.userId);
  }
  return profile || null;
}

// ── profile ───────────────────────────────────────────────────────────────────
function getUserById(uid) {
  return dbStore.getProfileById(uid);
}

function updateUserSetting(uid, patch) {
  return dbStore.updateProfileSetting(uid, patch);
}

// ── platform ──────────────────────────────────────────────────────────────────
function getPlatform(provider) {
  return readJson("platforms", {})[provider] || null;
}

function setPlatform(provider, data) {
  const platforms = readJson("platforms", {});
  platforms[provider] = { ...platforms[provider], ...data, provider, updatedAt: Date.now() };
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

function saveMatches(provider, matchs) {
  const now = Date.now();
  const next = {};
  const list = Array.isArray(matchs) ? matchs : [];
  const prev = _matches[provider];
  if (!list.length && prev && typeof prev === "object" && Object.keys(prev).length > 0) return;
  for (const m of list) {
    if (!m || m.SourceMatchID == null) continue;
    const start = Number(m.StartTime || 0);
    if (start > 0 && !a8StartTimeListAllowed(start)) continue;
    next[String(m.SourceMatchID)] = { ...m, provider, savedAt: now };
  }
  _matches[provider] = next;
  pruneBetsForProvider(provider, Object.keys(next));
  rebuildClientMatchListNow();
  const sb = require("../db/supabase.js");
  sb.writePlatformMatches(provider, Object.values(next));
}

const { normalizeImBet } = require("../shared/im_parse.js");

function mergeBetsByMap(existing, incoming) {
  const byMap = new Map();
  for (const b of existing || []) {
    if (String(b.BetName ?? "").includes("+")) continue;
    byMap.set(Number(b.Map ?? 0), formatBetOdds(b));
  }
  for (const b of incoming || []) {
    if (String(b.BetName ?? "").includes("+")) continue;
    byMap.set(Number(b.Map ?? 0), formatBetOdds(b));
  }
  return [...byMap.values()].sort((a, b) => (a.Map ?? 0) - (b.Map ?? 0));
}

function saveBets(provider, matchId, bets) {
  const key = `${provider}:${matchId}`;
  const existing = _bets[key]?.bets || [];
  const raw = Array.isArray(bets) ? bets : [];
  const incoming = provider === "IM" ? raw.map(normalizeImBet) : raw;
  if (incoming.length === 0) {
    if (existing.length > 0) return;
    _bets[key] = { provider, matchId: String(matchId), bets: [], savedAt: Date.now() };
    scheduleRebuildClientMatchList();
    return;
  }
  _bets[key] = { provider, matchId: String(matchId), bets: mergeBetsByMap(existing, incoming), savedAt: Date.now() };
  scheduleRebuildClientMatchList();
  const sb = require("../db/supabase.js");
  sb.writePlatformBets(provider, matchId, incoming);
}

function saveLiveTimer(provider, timer) {
  _timers[provider] = { provider, timer, savedAt: Date.now() };
  scheduleRebuildClientMatchList();
  const sb = require("../db/supabase.js");
  sb.writeLiveTimers(provider, timer);
}

// ── user kv / settings ────────────────────────────────────────────────────────
function getUserKv(key) { return readJson("user_kv", {})[key] ?? null; }

function setUserKv(key, content) {
  const kv = readJson("user_kv", {});
  kv[key] = content;
  writeJson("user_kv", kv);
}

function isUserSettingKey(key) { return USER_SETTING_KEYS.includes(key); }

function getUserSetting(userId, key) {
  if (!isUserSettingKey(key)) return null;
  return dbStore.getUserSetting(userId, key);
}

function setUserSetting(userId, key, content) {
  if (!isUserSettingKey(key)) { setUserKv(key, content); return; }
  dbStore.setUserSetting(userId, key, content ?? "");
}

// ── accounts ──────────────────────────────────────────────────────────────────
function getAccountsForUser(userId) { return dbStore.listAccountsForUser(userId); }
function setAccountsForUser(userId, accounts) { return dbStore.replaceAccountsForUser(userId, accounts); }
function updateAccountForUser(userId, accountId, updates) { return dbStore.updateAccountForUser(userId, accountId, updates); }
function removeAccountForUser(userId, accountId) { return dbStore.removeAccountForUser(userId, accountId); }

// ── match list ────────────────────────────────────────────────────────────────
function sourceFromBet(provider, b) {
  return {
    Type: provider,
    BetID: String(b.SourceBetID),
    HomeID: String(b.SourceHomeID),
    AwayID: String(b.SourceAwayID),
    HomeOdds: formatOdds(b.HomeOdds),
    AwayOdds: formatOdds(b.AwayOdds),
    Status: b.Status || "Normal",
  };
}

function rebuildClientMatchListNow() {
  const info = buildClientMatchList({ matches: _matches, bets: _bets, timers: _timers, sourceFromBet });
  dbStore.saveClientMatches(info);
  dbStore.pruneClientMatches(info.map((m) => Number(m.ID)));
  defaultOddsApi.recordFromMatchList(info);
  return info;
}

function scheduleRebuildClientMatchList() {
  if (clientMatchsRebuildTimer) clearTimeout(clientMatchsRebuildTimer);
  clientMatchsRebuildTimer = setTimeout(() => {
    clientMatchsRebuildTimer = null;
    try { rebuildClientMatchListNow(); } catch (err) { console.error("[store] rebuild failed:", err.message); }
  }, CLIENT_MATCHS_DEBOUNCE_MS);
}

async function buildMatchList() {
  // 1. 优先从 Supabase 读（跨实例共享最新数据）
  const fromDb = await dbStore.loadClientMatchesFromSupabase();
  if (fromDb?.length) return fromDb;
  // 2. 降级：内存实时重建
  return rebuildClientMatchListNow();
}

function getMatchDefaultOdds(matchIds) { return defaultOddsApi.getMatchDefaultOdds(matchIds, () => buildMatchList()); }
function getDefaultOddsSingle(betId, team) { return defaultOddsApi.getDefaultOddsSingle(betId, team, () => buildMatchList()); }
function parseKvContent(raw) {
  if (raw == null || raw === "") return null;
  try { return JSON.parse(raw); } catch { return raw; }
}

module.exports = {
  DATA_DIR, ensureSeed,
  getUserBySupabaseToken, getUserById, updateUserSetting,
  getPlatform, setPlatform,
  saveMatches, saveBets, saveLiveTimer,
  getUserKv, setUserKv, isUserSettingKey,
  getUserSetting, setUserSetting,
  getAccountsForUser, setAccountsForUser, updateAccountForUser, removeAccountForUser,
  parseKvContent, buildMatchList, getMatchDefaultOdds, getDefaultOddsSingle,
  rebuildClientMatchListNow, scheduleRebuildClientMatchList,
  readJson, writeJson,
};
