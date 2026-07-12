/**
 * RDS 公共工具 — pool 访问、fire-and-forget 写入、jsonb 序列化。
 * rds/*_store 均经此 getPgPool() 取连接池。
 */

import { getDbMode } from "../db_script.js";
import { getPgPool as getSharedPgPool } from "../pg_pool.js";

const _mode = getDbMode();
const _writeQueue = [];
let _activeWrites = 0;
const _activeWriteKeys = new Set();
let _droppedWrites = 0;

function envInt(name, fallback) {
  const n = Number(process.env[name]);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : fallback;
}

const WRITE_CONCURRENCY = envInt("RDS_WRITE_CONCURRENCY", 3);
const WRITE_QUEUE_MAX = envInt("RDS_WRITE_QUEUE_MAX", 2000);

export function getPgPool() {
  return getSharedPgPool(`GAMEBET_DB_SCRIPT=${_mode.script}`);
}

export function jsonb(val, fallback) {
  if (val == null)
    return JSON.stringify(fallback ?? null);
  return JSON.stringify(val);
}

/** impl_rds 内部沿用旧名 */
export const _jsonb = jsonb;

/** fire-and-forget 写入 RDS */
export function _writeRds(fn, label = "", opts = {}) {
  const pool = getPgPool();
  if (!pool)
    return;
  if (_writeQueue.length >= WRITE_QUEUE_MAX) {
    _droppedWrites += 1;
    if (_droppedWrites === 1 || _droppedWrites % 100 === 0) {
      console.warn(
        `[rds${label ? `:${label}` : ""}] write queue full, dropped=${_droppedWrites}, pending=${_writeQueue.length}`,
      );
    }
    return;
  }
  _writeQueue.push({ fn, label, pool, key: opts.key ? String(opts.key) : "" });
  _drainWriteQueue();
}

function _nextWriteIndex() {
  return _writeQueue.findIndex(item => !item.key || !_activeWriteKeys.has(item.key));
}

function _drainWriteQueue() {
  while (_activeWrites < WRITE_CONCURRENCY && _writeQueue.length) {
    const idx = _nextWriteIndex();
    if (idx < 0)
      return;
    const [item] = _writeQueue.splice(idx, 1);
    _activeWrites += 1;
    if (item.key)
      _activeWriteKeys.add(item.key);
    Promise.resolve()
      .then(() => item.fn(item.pool))
      .catch(err => console.warn(`[rds${item.label ? `:${item.label}` : ""}]`, err.message))
      .finally(() => {
        _activeWrites -= 1;
        if (item.key)
          _activeWriteKeys.delete(item.key);
        _drainWriteQueue();
      });
  }
}

export async function _writeRdsAsync(fn, label = "") {
  const pool = getPgPool();
  if (!pool)
    return;
  try {
    await fn(pool);
  }
  catch (err) {
    console.warn(`[rds${label ? `:${label}` : ""}]`, err.message);
    throw err;
  }
}

/** /health/diag：RDS 异步写队列深度（排查 closure 堆积） */
export function getRdsWriteQueueStats() {
  return {
    pending: _writeQueue.length,
    active: _activeWrites,
    activeKeys: _activeWriteKeys.size,
    dropped: _droppedWrites,
    max: WRITE_QUEUE_MAX,
    concurrency: WRITE_CONCURRENCY,
  };
}
