/**
 * RDS 公共工具 — pool 访问、fire-and-forget 写入、jsonb 序列化。
 * rds/*_store 均经此 getPgPool() 取连接池。
 */

import { getDbMode } from "../db_script.js";
import { getPgPool as getSharedPgPool } from "../pg_pool.js";

const _mode = getDbMode();

export function getPgPool() {
  return getSharedPgPool(`GAMEBET_DB_SCRIPT=${_mode.script}`);
}

export function jsonb(val, fallback) {
  if (val == null) return JSON.stringify(fallback ?? null);
  return JSON.stringify(val);
}

/** impl_rds 内部沿用旧名 */
export const _jsonb = jsonb;

/** fire-and-forget 写入 RDS */
export function _writeRds(fn, label = "") {
  const pool = getPgPool();
  if (!pool) return;
  Promise.resolve()
    .then(() => fn(pool))
    .catch((err) => console.warn(`[rds${label ? ":" + label : ""}]`, err.message));
}

export async function _writeRdsAsync(fn, label = "") {
  const pool = getPgPool();
  if (!pool) return;
  try {
    await fn(pool);
  } catch (err) {
    console.warn(`[rds${label ? ":" + label : ""}]`, err.message);
    throw err;
  }
}
