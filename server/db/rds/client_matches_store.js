/**
 * client_matches 表 — matcher rebuild 写入与 backend 读取。
 */

import { CLIENT_MATCH_LIST_HIDDEN, CLIENT_MATCH_LIST_DEFAULT } from "../client_match_list_status.js";
import { getPgPool, _writeRds, _jsonb } from "./common.js";

/** 上次写入的 id 集合，用于 diff-based 删除，避免每次 rebuild 全表扫描 */
let _lastWrittenIds = new Set();

async function _rdsUpsertClientMatches(pool, dedupedRows, toDelete) {
  const client = await pool.connect();
  const sql = `
    INSERT INTO client_matches (
      id, merge_key, title, game, game_id, start_time, bo, round, round_start,
      matchs, bets, reverse, built_at, list_status
    ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10::jsonb,$11::jsonb,$12::jsonb,$13,$14)
    ON CONFLICT (id) DO UPDATE SET
      merge_key = EXCLUDED.merge_key,
      title = EXCLUDED.title,
      game = EXCLUDED.game,
      game_id = EXCLUDED.game_id,
      start_time = EXCLUDED.start_time,
      bo = EXCLUDED.bo,
      round = EXCLUDED.round,
      round_start = EXCLUDED.round_start,
      matchs = EXCLUDED.matchs,
      bets = EXCLUDED.bets,
      reverse = EXCLUDED.reverse,
      built_at = EXCLUDED.built_at,
      list_status = EXCLUDED.list_status
  `;
  try {
    await client.query("BEGIN");
    for (const r of dedupedRows) {
      await client.query(sql, [
        Number(r.id),
        r.merge_key != null ? String(r.merge_key) : null,
        String(r.title || ""),
        r.game != null ? String(r.game) : null,
        r.game_id != null ? String(r.game_id) : null,
        r.start_time != null ? Number(r.start_time) : null,
        r.bo != null ? Number(r.bo) : null,
        r.round != null ? Number(r.round) : null,
        Number(r.round_start) || 0,
        _jsonb(r.matchs, {}),
        _jsonb(r.bets, []),
        _jsonb(r.reverse, []),
        Number(r.built_at),
        Number(r.list_status ?? CLIENT_MATCH_LIST_DEFAULT),
      ]);
    }
    if (toDelete.length) {
      await client.query(
        `DELETE FROM client_matches WHERE id = ANY($1::bigint[]) AND list_status IS DISTINCT FROM $2`,
        [toDelete, CLIENT_MATCH_LIST_HIDDEN],
      );
    }
    await client.query("COMMIT");
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

async function _rdsFetchClientMatches(pool) {
  const { rows } = await pool.query(
    `SELECT * FROM client_matches
     WHERE list_status IS DISTINCT FROM $1
     ORDER BY start_time ASC NULLS LAST`,
    [CLIENT_MATCH_LIST_HIDDEN],
  );
  return rows;
}

async function _rdsFetchClientMatchesMeta(pool) {
  const { rows } = await pool.query(
    `SELECT COUNT(*)::int AS count, COALESCE(MAX(built_at), 0)::bigint AS built_at
     FROM client_matches
     WHERE list_status IS DISTINCT FROM $1`,
    [CLIENT_MATCH_LIST_HIDDEN],
  );
  const row = rows[0] || {};
  return { builtAt: Number(row.built_at) || 0, count: Number(row.count) || 0 };
}

async function _rdsInitLastWrittenIds(pool) {
  const { rows } = await pool.query("SELECT id FROM client_matches");
  _lastWrittenIds = new Set(rows.map((r) => Number(r.id)));
  console.log(`[rds] 已从 client_matches 加载 ${_lastWrittenIds.size} 条 id`);
}

function _prepareClientMatchWrite(rows) {
  if (!Array.isArray(rows)) return null;
  const seen = new Map();
  for (const row of rows) seen.set(Number(row.id), row);
  const dedupedRows = [...seen.values()];
  const activeIds = new Set(dedupedRows.map((r) => Number(r.id)));
  const toDelete = [..._lastWrittenIds].filter((id) => !activeIds.has(id));
  _lastWrittenIds = activeIds;
  return { dedupedRows, toDelete };
}

/** fire-and-forget：upsert 客户端比赛列表，只删离开活跃列表的行 */
export function writeClientMatches(rows) {
  const prepared = _prepareClientMatchWrite(rows);
  if (!prepared) return;
  const { dedupedRows, toDelete } = prepared;
  _writeRds((pool) => _rdsUpsertClientMatches(pool, dedupedRows, toDelete), "client_matches");
}

/** await 写入完成（matcher / rebuild 使用，避免前端读到上一版） */
export async function writeClientMatchesAsync(rows) {
  const prepared = _prepareClientMatchWrite(rows);
  if (!prepared) return;
  const { dedupedRows, toDelete } = prepared;
  const pool = getPgPool();
  if (!pool) {
    writeClientMatches(rows);
    return;
  }
  await _rdsUpsertClientMatches(pool, dedupedRows, toDelete);
}

/** 启动时预填 _lastWrittenIds，使差量删除能覆盖上次遗留行 */
export async function initLastWrittenIds() {
  const pool = getPgPool();
  if (!pool) return;
  try {
    await _rdsInitLastWrittenIds(pool);
  } catch (err) {
    console.warn("[rds] initLastWrittenIds 失败:", err.message);
  }
}

/**
 * 轻量探测 client_matches 是否变化（供 backend 快照缓存失效，避免每次 Client_GetMatchs 全表 SELECT *）。
 * @returns {Promise<{ builtAt: number, count: number }|null>} 失败时 null
 */
export async function fetchClientMatchesMeta() {
  const pool = getPgPool();
  if (!pool) return null;
  try {
    return await _rdsFetchClientMatchesMeta(pool);
  } catch (err) {
    console.warn("[rds] fetchClientMatchesMeta 失败:", err.message);
    return null;
  }
}

/**
 * 从 RDS 读取 client_matches，按 start_time 升序排列。
 * @returns {Promise<object[]|null>} 成功时返回数组（可为空）；失败/未配置时返回 null。
 */
export async function fetchClientMatches() {
  const pool = getPgPool();
  if (!pool) return null;
  try {
    return await _rdsFetchClientMatches(pool);
  } catch (err) {
    console.warn("[rds] fetchClientMatches 失败:", err.message);
    return null;
  }
}

/**
 * align / ID 挂接专用：含 list_status=-1 隐藏行，避免复活场 id 分裂。
 */
async function _rdsFetchClientMatchesForAlign(pool) {
  const { rows } = await pool.query(
    `SELECT id, merge_key, title, game_id, start_time, matchs
     FROM client_matches`,
  );
  return rows;
}

export async function fetchClientMatchesForAlign() {
  const pool = getPgPool();
  if (!pool) return null;
  try {
    return await _rdsFetchClientMatchesForAlign(pool);
  } catch (err) {
    console.warn("[rds] fetchClientMatchesForAlign 失败:", err.message);
    return null;
  }
}
