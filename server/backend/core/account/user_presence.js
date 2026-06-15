import store from "../esport-api/store.js";

/** 与 A8 Client_GetUsers 一致：30 分钟内活跃视为在线 */
export const ONLINE_WINDOW_MS = 30 * 60 * 1000;

/** @type {Map<string, number>} */
const lastActive = new Map();
let hydrated = false;
let persistTimer = null;

const PERSIST_DEBOUNCE_MS = 60_000;

function hydrateFromLegacySessions() {
  const sessions = store.readJson("sessions", {});
  for (const session of Object.values(sessions || {})) {
    if (!session?.userId) continue;
    const uid = String(session.userId);
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

/** 用户发起已鉴权请求或登录成功时刷新活跃时间 */
export function touchUserPresence(userId) {
  if (!userId) return;
  ensureHydrated();
  const uid = String(userId);
  lastActive.set(uid, Date.now());
  schedulePersist();
}

export function getUserLastActiveAt(userId) {
  ensureHydrated();
  return lastActive.get(String(userId)) || 0;
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
