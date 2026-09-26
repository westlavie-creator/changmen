import { isObSportHexToken, normalizeObSportGatewayCandidate } from "./ob-entry.js";

const DB_NAME = "sport_venue_params_db";
const STORE_NAME = "shared_params";

function openExistingDatabase(indexedDb) {
  return new Promise((resolve) => {
    if (!indexedDb?.open) {
      resolve(null);
      return;
    }
    let request;
    try {
      request = indexedDb.open(DB_NAME);
    }
    catch {
      resolve(null);
      return;
    }
    request.onupgradeneeded = () => {
      // 不存在时终止创建；插件只读取站点已经建立的凭证库。
      try { request.transaction?.abort(); } catch { /* ignore */ }
    };
    request.onerror = () => resolve(null);
    request.onsuccess = () => resolve(request.result || null);
  });
}

function readAll(db) {
  return new Promise((resolve) => {
    if (!db?.objectStoreNames?.contains?.(STORE_NAME)) {
      resolve([]);
      return;
    }
    let tx;
    try {
      tx = db.transaction(STORE_NAME, "readonly");
      const request = tx.objectStore(STORE_NAME).getAll();
      request.onerror = () => resolve([]);
      request.onsuccess = () => resolve(Array.isArray(request.result) ? request.result : []);
    }
    catch {
      resolve([]);
    }
  });
}

function parseVenueParams(value) {
  if (!value || typeof value !== "object" || Array.isArray(value))
    return null;
  const token = String(value.requestId || value.token || "").trim();
  const gateway = normalizeObSportGatewayCandidate(value.origin || value.gateway);
  const sessionId = String(value.cuid || value.userId || value.uid || value.sessionId || "").trim();
  // cuid 会进入体育请求的 checkId，并作为余额/下注接口的用户标识。
  // 只接受场馆实际使用的纯数字会员 ID，避免把占位值或其它会话字段误当 UID。
  if (!isObSportHexToken(token) || !gateway || !/^\d{18,}$/.test(sessionId))
    return null;
  return { token, gateway, sessionId, uid: sessionId };
}

/**
 * 体育版 `token + addr`：直接读取场馆 SDK 已写好的 requestId + origin + cuid。
 * 不发网络请求，不改 IndexedDB，也不依赖 indexedDB.databases()。
 */
export async function readObSportVenueParams(
  indexedDb = globalThis.indexedDB,
  activeToken = "",
) {
  const db = await openExistingDatabase(indexedDb);
  if (!db)
    return null;
  try {
    const rows = await readAll(db);
    const parsedRows = rows.map(parseVenueParams).filter(Boolean);
    const wantedToken = String(activeToken || "").trim();
    if (wantedToken)
      return parsedRows.find(row => row.token === wantedToken) || null;
    return parsedRows.at(-1) || null;
  }
  finally {
    try { db.close?.(); } catch { /* ignore */ }
  }
}
