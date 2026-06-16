import store from "../esport-api/store.js";
import * as sb from "@changmen/db";

/** 与 A8 Client_GetUsers 一致：30 分钟内活跃视为在线 */
export const ONLINE_WINDOW_MS = 30 * 60 * 1000;

/** @type {Map<string, number>} */
const lastActive = new Map();
/** @type {Set<string>} */
const dirtyForRds = new Set();
let hydrated = false;
let persistTimer = null;
let rdsPersistTimer = null;

const PERSIST_DEBOUNCE_MS = 15_000;
const RDS_PERSIST_DEBOUNCE_MS = 60_000;

function normalizeUid(userId) {
  return String(userId || "").trim().toLowerCase();
}

function readPrefLastActiveAt(profileRow) {
  const prefs = profileRow?.preferences;
  if (!prefs || typeof prefs !== "object" || Array.isArray(prefs)) return 0;
  return Number(prefs.lastActiveAt) || 0;
}

function hydrateFromLegacySessions() {
  const sessions = store.readJson("sessions", {});
  for (const session of Object.values(sessions || {})) {
    if (!session?.userId) continue;
    const uid = normalizeUid(session.userId);
    const ts = Number(session.lastActiveAt ?? session.createdAt ?? 0);
    if (!ts) continue;
    const prev = lastActive.get(uid) || 0;
    if (ts > prev) lastActive.set(uid, ts);
  }
}

function ensureHydrated() {
  if (hydrated) return;
  hydrateFromLegacySessions();
  hydrated = true;
}

function persistSessions() {
  const sessions = {};
  for (const [userId, ts] of lastActive) {
    sessions[`u:${userId}`] = { userId, createdAt: ts, lastActiveAt: ts };
  }
  store.writeJson("sessions", sessions);
}

function schedulePersist() {
  if (persistTimer) return;
  persistTimer = setTimeout(() => {
    persistTimer = null;
    try {
      persistSessions();
    } catch {
      /* 磁盘写入失败不影响在线判定 */
    }
  }, PERSIST_DEBOUNCE_MS);
  if (typeof persistTimer.unref === "function") persistTimer.unref();
}

async function flushPresenceToRds(userIds) {
  const pool = sb.getPgPool?.();
  if (!pool || !userIds.length) return;
  const now = Date.now();
  for (const uid of userIds) {
    const ts = lastActive.get(uid);
    if (!ts) continue;
    try {
      await pool.query(
        `UPDATE profiles
         SET preferences = COALESCE(preferences, '{}'::jsonb) || $2::jsonb,
             updated_at = $3
         WHERE id = $1`,
        [uid, JSON.stringify({ lastActiveAt: ts }), now],
      );
    } catch {
      /* RDS 写入失败不影响内存在线判定 */
    }
  }
}

function scheduleRdsPersist() {
  if (rdsPersistTimer) return;
  rdsPersistTimer = setTimeout(() => {
    rdsPersistTimer = null;
    const batch = [...dirtyForRds];
    dirtyForRds.clear();
    void flushPresenceToRds(batch);
  }, RDS_PERSIST_DEBOUNCE_MS);
  if (typeof rdsPersistTimer.unref === "function") rdsPersistTimer.unref();
}

/** 用户发起已鉴权请求或登录成功时刷新活跃时间 */
export function touchUserPresence(userId) {
  if (!userId) return;
  ensureHydrated();
  const uid = normalizeUid(userId);
  lastActive.set(uid, Date.now());
  dirtyForRds.add(uid);
  schedulePersist();
  scheduleRdsPersist();
}

export function getUserLastActiveAt(userId) {
  ensureHydrated();
  return lastActive.get(normalizeUid(userId)) || 0;
}

export function getOnlineUserIdSet(now = Date.now()) {
  ensureHydrated();
  const online = new Set();
  for (const [uid, ts] of lastActive) {
    if (now - ts < ONLINE_WINDOW_MS) online.add(uid);
  }
  return online;
}

export function isUserOnline(userId, now = Date.now()) {
  const ts = getUserLastActiveAt(userId);
  return ts > 0 && now - ts < ONLINE_WINDOW_MS;
}

/** 管理端：合并内存与 profiles.preferences.lastActiveAt */
export function resolvePresenceState(userId, profileRow = null, now = Date.now()) {
  const lastActiveAt = Math.max(
    getUserLastActiveAt(userId),
    readPrefLastActiveAt(profileRow),
  );
  const isOnline = lastActiveAt > 0 && now - lastActiveAt < ONLINE_WINDOW_MS ? 1 : 0;
  return { lastActiveAt, isOnline };
}
