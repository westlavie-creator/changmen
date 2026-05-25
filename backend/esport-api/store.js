"use strict";

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { buildClientMatchList } = require("./match_merge");
const { formatOdds, formatBetOdds } = require("../shared/odds_format.js");

const DATA_DIR = process.env.ESPORT_DATA_DIR
  || path.join(__dirname, "..", "data", "esport");

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

function hashPassword(password, salt) {
  return crypto.pbkdf2Sync(password, salt, 120000, 32, "sha256").toString("hex");
}

function newToken() {
  return crypto.randomBytes(24).toString("hex");
}

const DEFAULT_USER_KV = {
  CollectConfig: JSON.stringify({
    log: false,
    collect: [["OB", true], ["RAY", true]],
  }),
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
  PROXY: JSON.stringify([]),
  GoogleCode: JSON.stringify([]),
  Wallet: JSON.stringify([]),
  Message: JSON.stringify({ telegramId: "", pushOrderId: "" }),
  Follow: JSON.stringify({}),
};

function ensureSeed() {
  const users = readJson("users", null);
  if (!users) {
    const salt = crypto.randomBytes(16).toString("hex");
    writeJson("users", [
      {
        id: 1,
        userName: "admin",
        passwordHash: hashPassword("admin", salt),
        salt,
        setting: {},
      },
    ]);
    writeJson("sessions", {});
    writeJson("platforms", {});
    writeJson("matches", {});
    writeJson("bets", {});
    writeJson("user_kv", { ...DEFAULT_USER_KV });
    writeJson("live_timers", {});
    writeJson("tag_platforms", {});
    writeJson("players", {});
    writeJson("money_logs", {});
    writeJson("player_orders", {});
    return;
  }
  const kv = readJson("user_kv", {});
  let changed = false;
  for (const [key, val] of Object.entries(DEFAULT_USER_KV)) {
    if (kv[key] == null) {
      kv[key] = val;
      changed = true;
    }
  }
  if (changed) writeJson("user_kv", kv);
}

function stableMatchId(gid) {
  let h = 0;
  for (const c of String(gid)) h = (Math.imul(31, h) + c.charCodeAt(0)) >>> 0;
  return h || 1;
}

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

function getUserByName(userName) {
  const users = readJson("users", []);
  return users.find((u) => u.userName === userName);
}

function getUserById(userId) {
  const users = readJson("users", []);
  return users.find((u) => u.id === userId) || null;
}

function createUser(userName, password, setting = {}) {
  const users = readJson("users", []);
  const salt = crypto.randomBytes(16).toString("hex");
  const id = users.length ? Math.max(...users.map((u) => u.id)) + 1 : 1;
  const user = {
    id,
    userName,
    passwordHash: hashPassword(password, salt),
    salt,
    setting: {
      a8UserName: userName,
      a8Password: password,
      ...setting,
    },
  };
  users.push(user);
  writeJson("users", users);
  return user;
}

function updateUserSetting(userId, patch) {
  const users = readJson("users", []);
  const idx = users.findIndex((u) => u.id === userId);
  if (idx < 0) return null;
  users[idx].setting = { ...(users[idx].setting || {}), ...patch };
  writeJson("users", users);
  return users[idx];
}

function getSession(token) {
  if (!token) return null;
  const sessions = readJson("sessions", {});
  return sessions[token] || null;
}

function getUserByToken(token) {
  if (!token) return null;
  const sessions = readJson("sessions", {});
  const session = sessions[token];
  if (!session) return null;
  const users = readJson("users", []);
  return users.find((u) => u.id === session.userId) || null;
}

function createSession(userId, extra = {}) {
  const token = newToken();
  const sessions = readJson("sessions", {});
  sessions[token] = { userId, createdAt: Date.now(), ...extra };
  writeJson("sessions", sessions);
  return token;
}

function removeSession(token) {
  const sessions = readJson("sessions", {});
  delete sessions[token];
  writeJson("sessions", sessions);
}

function getPlatform(provider) {
  const platforms = readJson("platforms", {});
  return platforms[provider] || null;
}

function setPlatform(provider, data) {
  const platforms = readJson("platforms", {});
  platforms[provider] = { ...platforms[provider], ...data, provider, updatedAt: Date.now() };
  writeJson("platforms", platforms);
  return platforms[provider];
}

function pruneBetsForProvider(provider, activeMatchIds) {
  const active = new Set(activeMatchIds.map(String));
  const all = readJson("bets", {});
  const prefix = `${provider}:`;
  let changed = false;
  for (const key of Object.keys(all)) {
    if (!key.startsWith(prefix)) continue;
    const matchId = key.slice(prefix.length);
    if (!active.has(matchId)) {
      delete all[key];
      changed = true;
    }
  }
  if (changed) writeJson("bets", all);
}

/** 每次 SaveMatch 用本批列表覆盖该 provider 下的全部比赛（平台当前快照） */
function saveMatches(provider, matchs) {
  const all = readJson("matches", {});
  const now = Date.now();
  const next = {};
  const list = Array.isArray(matchs) ? matchs : [];
  for (const m of list) {
    if (!m || m.SourceMatchID == null) continue;
    next[String(m.SourceMatchID)] = { ...m, provider, savedAt: now };
  }
  all[provider] = next;
  writeJson("matches", all);
  pruneBetsForProvider(provider, Object.keys(next));
}

function mergeBetsByMap(existing, incoming) {
  const byMap = new Map();
  for (const b of existing || []) {
    byMap.set(Number(b.Map ?? 0), formatBetOdds(b));
  }
  for (const b of incoming || []) {
    byMap.set(Number(b.Map ?? 0), formatBetOdds(b));
  }
  return [...byMap.values()].sort((a, b) => (a.Map ?? 0) - (b.Map ?? 0));
}

/**
 * A8 采集按场/按 stage 多次上传；OB 分 stage 轮询时单批常不完整。
 * 按 Map 合并，空批次不覆盖，避免地图行时有时无。
 */
function saveBets(provider, matchId, bets) {
  const all = readJson("bets", {});
  const key = `${provider}:${matchId}`;
  const existing = all[key]?.bets || [];
  const incoming = Array.isArray(bets) ? bets : [];

  if (incoming.length === 0) {
    if (existing.length > 0) return;
    all[key] = { provider, matchId: String(matchId), bets: [], savedAt: Date.now() };
    writeJson("bets", all);
    return;
  }

  const merged = mergeBetsByMap(existing, incoming);
  all[key] = { provider, matchId: String(matchId), bets: merged, savedAt: Date.now() };
  writeJson("bets", all);
}

function saveLiveTimer(provider, timer) {
  const all = readJson("live_timers", {});
  all[provider] = { provider, timer, savedAt: Date.now() };
  writeJson("live_timers", all);
}

function getUserKv(key) {
  const kv = readJson("user_kv", {});
  return kv[key] ?? null;
}

function setUserKv(key, content) {
  const kv = readJson("user_kv", {});
  kv[key] = content;
  writeJson("user_kv", kv);
}

function parseKvContent(raw) {
  if (raw == null || raw === "") return null;
  try {
    return JSON.parse(raw);
  } catch {
    return raw;
  }
}

function buildMatchList() {
  return buildClientMatchList({
    matches: readJson("matches", {}),
    bets: readJson("bets", {}),
    timers: readJson("live_timers", {}),
    sourceFromBet,
  });
}

module.exports = {
  DATA_DIR,
  ensureSeed,
  getUserByName,
  getUserById,
  getUserByToken,
  createUser,
  updateUserSetting,
  getSession,
  createSession,
  removeSession,
  hashPassword,
  getPlatform,
  setPlatform,
  saveMatches,
  saveBets,
  saveLiveTimer,
  getUserKv,
  setUserKv,
  parseKvContent,
  buildMatchList,
  readJson,
  writeJson,
};
