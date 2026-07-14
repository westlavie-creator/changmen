/**
 * 棒球/足球只读列表磁盘缓存。
 *
 * 硬约束：
 * - 仅写入 `{ESPORT_DATA_DIR}/sport/{cacheKey}/match_list.json`
 * - 禁止 client_matches / legacy/esport / RDS
 * - 本文件不得 import @changmen/db
 */
import fs from "node:fs";
import path from "node:path";
import { ESPORT_DATA_DIR } from "../shared/storage_paths.js";

/** 磁盘新鲜窗口：未过期时可跳过打 Gamma */
export const SPORT_DISK_TTL_MS = Number(process.env.SPORT_LIST_DISK_TTL_MS) || 10 * 60_000;

const SPORT_ROOT = "sport";
const LIST_FILE = "match_list.json";

/**
 * @param {string} cacheKey
 * @returns {string}
 */
function sanitizeCacheKey(cacheKey) {
  const key = String(cacheKey || "").trim().toLowerCase();
  if (!/^[a-z][a-z0-9_-]{0,63}$/.test(key))
    throw new Error(`invalid sport cacheKey: ${cacheKey}`);
  if (key.includes("client_matches") || key.includes("esport"))
    throw new Error(`refused sport cacheKey: ${cacheKey}`);
  return key;
}

/**
 * @param {string} cacheKey
 * @returns {string} absolute path under …/sport/{key}/match_list.json
 */
export function sportListCachePath(cacheKey) {
  const key = sanitizeCacheKey(cacheKey);
  const filePath = path.resolve(ESPORT_DATA_DIR, SPORT_ROOT, key, LIST_FILE);
  const sportRoot = path.resolve(ESPORT_DATA_DIR, SPORT_ROOT);
  if (!filePath.startsWith(sportRoot + path.sep) && filePath !== sportRoot)
    throw new Error("sport cache path escaped sport/ root");
  if (filePath.includes(`${path.sep}client_matches`) || filePath.includes(`${path.sep}legacy${path.sep}esport`))
    throw new Error("sport cache path must not touch esport lists");
  return filePath;
}

/**
 * @typedef {{ at: number, rows: object[], cacheKey: string }} SportListDiskSnapshot
 */

/**
 * @param {string} cacheKey
 * @returns {SportListDiskSnapshot | null}
 */
export function readSportListCache(cacheKey) {
  const filePath = sportListCachePath(cacheKey);
  if (!fs.existsSync(filePath))
    return null;
  try {
    const raw = fs.readFileSync(filePath, "utf8");
    const data = JSON.parse(raw);
    const at = Number(data?.at) || 0;
    const rows = Array.isArray(data?.rows) ? data.rows : null;
    if (!at || !rows)
      return null;
    return { at, rows, cacheKey: sanitizeCacheKey(cacheKey) };
  }
  catch (err) {
    console.warn("[sportListCache] read failed", cacheKey, err?.message || err);
    return null;
  }
}

/**
 * @param {string} cacheKey
 * @param {object[]} rows
 * @param {number} [at]
 */
export function writeSportListCache(cacheKey, rows, at = Date.now()) {
  if (!Array.isArray(rows))
    return;
  const filePath = sportListCachePath(cacheKey);
  const dir = path.dirname(filePath);
  fs.mkdirSync(dir, { recursive: true });
  const payload = {
    at,
    cacheKey: sanitizeCacheKey(cacheKey),
    rows,
  };
  const tmp = `${filePath}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(payload), "utf8");
  fs.renameSync(tmp, filePath);
}

/**
 * @param {string} cacheKey
 * @param {number} [ttlMs]
 * @returns {SportListDiskSnapshot | null} 仅当未过磁盘 TTL
 */
export function readFreshSportListCache(cacheKey, ttlMs = SPORT_DISK_TTL_MS) {
  const snap = readSportListCache(cacheKey);
  if (!snap)
    return null;
  if (Date.now() - snap.at > ttlMs)
    return null;
  return snap;
}
