/**
 * client_matches 表 — matcher matchMerge 写入与 backend 读取。
 * 不再使用 list_status；过期行移入 client_matches_history。
 */

import { _jsonb, _writeRds, getPgPool } from "./common.js";

/** 上次写入的 id 集合，用于 diff-based 删除，避免每次 matchMerge 全表扫描 */
let _lastWrittenIds = new Set();
let _lastWrittenIdsInitPromise = null;
let _lastWrittenIdsInitialized = false;

/**
 * gb 写库编码：
 * - null/undefined/"" → SQL NULL 入参，UPSERT 时 **保留**旧锁（legacy 安全）
 * - 0 → 哨兵，UPSERT 时 **清空**锁（仅 projector clearLock）
 * - >0 → 写入该 id
 */
function _gbTeamIdForDb(value) {
  if (value == null || value === "")
    return null;
  const n = Number(value);
  if (n === 0)
    return 0;
  return Number.isFinite(n) && n > 0 ? n : null;
}

/** UPSERT：0=清空；非空=覆盖；NULL 入参=保留旧值（生产 legacy 勿误清锁） */
const GB_TEAM_ID_UPSERT_SQL = `
      home_gb_team_id = CASE
        WHEN EXCLUDED.home_gb_team_id = 0 THEN NULL
        WHEN EXCLUDED.home_gb_team_id IS NOT NULL THEN EXCLUDED.home_gb_team_id
        ELSE client_matches.home_gb_team_id
      END,
      away_gb_team_id = CASE
        WHEN EXCLUDED.away_gb_team_id = 0 THEN NULL
        WHEN EXCLUDED.away_gb_team_id IS NOT NULL THEN EXCLUDED.away_gb_team_id
        ELSE client_matches.away_gb_team_id
      END`;

async function _rdsUpsertClientMatches(pool, dedupedRows, toDelete) {
  const client = await pool.connect();
  const sql = `
    INSERT INTO client_matches (
      id, merge_key, title, game, game_id, start_time, bo, round, round_start,
      matchs, bets, reverse, built_at, pm_sport, home_gb_team_id, away_gb_team_id
    )
    SELECT * FROM unnest(
      $1::bigint[], $2::text[], $3::text[], $4::text[], $5::text[],
      $6::bigint[], $7::integer[], $8::integer[], $9::bigint[],
      $10::jsonb[], $11::jsonb[], $12::jsonb[], $13::bigint[], $14::jsonb[],
      $15::bigint[], $16::bigint[]
    )
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
      pm_sport = COALESCE(EXCLUDED.pm_sport, client_matches.pm_sport),
      ${GB_TEAM_ID_UPSERT_SQL}
  `;
  try {
    await client.query("BEGIN");
    if (dedupedRows.length) {
      await client.query(sql, [
        dedupedRows.map(r => Number(r.id)),
        dedupedRows.map(r => (r.merge_key != null ? String(r.merge_key) : null)),
        dedupedRows.map(r => String(r.title || "")),
        dedupedRows.map(r => (r.game != null ? String(r.game) : null)),
        dedupedRows.map(r => (r.game_id != null ? String(r.game_id) : null)),
        dedupedRows.map(r => (r.start_time != null ? Number(r.start_time) : null)),
        dedupedRows.map(r => (r.bo != null ? Number(r.bo) : null)),
        dedupedRows.map(r => (r.round != null ? Number(r.round) : null)),
        dedupedRows.map(r => Number(r.round_start) || 0),
        dedupedRows.map(r => _jsonb(r.matchs, {})),
        dedupedRows.map(r => _jsonb(r.bets, [])),
        dedupedRows.map(r => _jsonb(r.reverse, [])),
        dedupedRows.map(r => Number(r.built_at)),
        dedupedRows.map(r => (r.pm_sport != null ? _jsonb(r.pm_sport, null) : null)),
        dedupedRows.map(r => _gbTeamIdForDb(r.home_gb_team_id)),
        dedupedRows.map(r => _gbTeamIdForDb(r.away_gb_team_id)),
      ]);
    }
    if (toDelete.length) {
      await client.query(
        `WITH moved AS (
           DELETE FROM client_matches WHERE id = ANY($1::bigint[])
           RETURNING *
         )
         INSERT INTO client_matches_history (id, title, game, game_id, start_time, bo, round, matchs, bets, reverse, built_at, pm_sport, home_gb_team_id, away_gb_team_id)
         SELECT id, title, game, game_id, start_time, bo, round, matchs, bets, reverse, built_at, pm_sport, home_gb_team_id, away_gb_team_id FROM moved`,
        [toDelete],
      );
    }
    await client.query("COMMIT");
  }
  catch (err) {
    await client.query("ROLLBACK");
    throw err;
  }
  finally {
    client.release();
  }
}

/**
 * 在同一事务内：锁表 → 读现有 id → upsert → 差量归档。
 * 避免跨进程 TOCTOU，以及 prepare 成功但 commit 失败导致内存差量漂移。
 */
async function _rdsReplaceClientMatches(pool, dedupedRows, activeIds) {
  const client = await pool.connect();
  const sql = `
    INSERT INTO client_matches (
      id, merge_key, title, game, game_id, start_time, bo, round, round_start,
      matchs, bets, reverse, built_at, pm_sport, home_gb_team_id, away_gb_team_id
    )
    SELECT * FROM unnest(
      $1::bigint[], $2::text[], $3::text[], $4::text[], $5::text[],
      $6::bigint[], $7::integer[], $8::integer[], $9::bigint[],
      $10::jsonb[], $11::jsonb[], $12::jsonb[], $13::bigint[], $14::jsonb[],
      $15::bigint[], $16::bigint[]
    )
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
      pm_sport = COALESCE(EXCLUDED.pm_sport, client_matches.pm_sport),
      ${GB_TEAM_ID_UPSERT_SQL}
  `;
  try {
    await client.query("BEGIN");
    await client.query("LOCK TABLE client_matches IN SHARE ROW EXCLUSIVE MODE");
    const { rows: idRows } = await client.query("SELECT id FROM client_matches");
    const existingIds = new Set(idRows.map(r => Number(r.id)));
    const toDelete = [...existingIds].filter(id => !activeIds.has(id));

    if (dedupedRows.length) {
      await client.query(sql, [
        dedupedRows.map(r => Number(r.id)),
        dedupedRows.map(r => (r.merge_key != null ? String(r.merge_key) : null)),
        dedupedRows.map(r => String(r.title || "")),
        dedupedRows.map(r => (r.game != null ? String(r.game) : null)),
        dedupedRows.map(r => (r.game_id != null ? String(r.game_id) : null)),
        dedupedRows.map(r => (r.start_time != null ? Number(r.start_time) : null)),
        dedupedRows.map(r => (r.bo != null ? Number(r.bo) : null)),
        dedupedRows.map(r => (r.round != null ? Number(r.round) : null)),
        dedupedRows.map(r => Number(r.round_start) || 0),
        dedupedRows.map(r => _jsonb(r.matchs, {})),
        dedupedRows.map(r => _jsonb(r.bets, [])),
        dedupedRows.map(r => _jsonb(r.reverse, [])),
        dedupedRows.map(r => Number(r.built_at)),
        dedupedRows.map(r => (r.pm_sport != null ? _jsonb(r.pm_sport, null) : null)),
        dedupedRows.map(r => _gbTeamIdForDb(r.home_gb_team_id)),
        dedupedRows.map(r => _gbTeamIdForDb(r.away_gb_team_id)),
      ]);
    }
    if (toDelete.length) {
      await client.query(
        `WITH moved AS (
           DELETE FROM client_matches WHERE id = ANY($1::bigint[])
           RETURNING *
         )
         INSERT INTO client_matches_history (id, title, game, game_id, start_time, bo, round, matchs, bets, reverse, built_at, pm_sport, home_gb_team_id, away_gb_team_id)
         SELECT id, title, game, game_id, start_time, bo, round, matchs, bets, reverse, built_at, pm_sport, home_gb_team_id, away_gb_team_id FROM moved`,
        [toDelete],
      );
    }
    await client.query("COMMIT");
    _lastWrittenIds = activeIds;
    _lastWrittenIdsInitialized = true;
  }
  catch (err) {
    await client.query("ROLLBACK");
    throw err;
  }
  finally {
    client.release();
  }
}

async function _rdsFetchClientMatches(pool) {
  const { rows } = await pool.query(
    `SELECT * FROM client_matches
     ORDER BY start_time ASC NULLS LAST`,
  );
  return rows;
}

async function _rdsFetchClientMatchesMeta(pool) {
  const { rows } = await pool.query(
    `SELECT COUNT(*)::int AS count,
            COALESCE(MAX(built_at), 0)::bigint AS built_at,
            COALESCE(MAX((pm_sport->>'updatedAt')::bigint), 0)::bigint AS pm_sport_rev
     FROM client_matches`,
  );
  const row = rows[0] || {};
  return {
    builtAt: Number(row.built_at) || 0,
    count: Number(row.count) || 0,
    pmSportRev: Number(row.pm_sport_rev) || 0,
  };
}

async function _rdsInitLastWrittenIds(pool) {
  const { rows } = await pool.query("SELECT id FROM client_matches");
  _lastWrittenIds = new Set(rows.map(r => Number(r.id)));
  _lastWrittenIdsInitialized = true;
  console.log(`[rds] 已从 client_matches 加载 ${_lastWrittenIds.size} 条 id`);
}

function _dedupeClientMatchRows(rows) {
  const seen = new Map();
  for (const row of rows) seen.set(Number(row.id), row);
  return [...seen.values()];
}

function _prepareClientMatchWrite(rows) {
  if (!Array.isArray(rows))
    return null;
  const dedupedRows = _dedupeClientMatchRows(rows);
  const activeIds = new Set(dedupedRows.map(r => Number(r.id)));
  const toDelete = [..._lastWrittenIds].filter(id => !activeIds.has(id));
  return { dedupedRows, toDelete, activeIds };
}

/** fire-and-forget：upsert 客户端比赛列表，离开活跃列表的行移入 history */
export function writeClientMatches(rows) {
  const prepared = _prepareClientMatchWrite(rows);
  if (!prepared)
    return;
  const { dedupedRows, toDelete, activeIds } = prepared;
  _writeRds(async (pool) => {
    await _rdsUpsertClientMatches(pool, dedupedRows, toDelete);
    _lastWrittenIds = activeIds;
    _lastWrittenIdsInitialized = true;
  }, "client_matches");
}

/** await 写入完成（matcher / matchMerge 使用，避免前端读到上一版） */
export async function writeClientMatchesAsync(rows) {
  if (!Array.isArray(rows))
    return;
  const pool = getPgPool();
  if (!pool) {
    writeClientMatches(rows);
    return;
  }
  const dedupedRows = _dedupeClientMatchRows(rows);
  const activeIds = new Set(dedupedRows.map(r => Number(r.id)));
  await _rdsReplaceClientMatches(pool, dedupedRows, activeIds);
}

/** 启动时预填 _lastWrittenIds，使差量删除能覆盖上次遗留行 */
export async function initLastWrittenIds() {
  if (_lastWrittenIdsInitialized)
    return;
  if (_lastWrittenIdsInitPromise)
    return _lastWrittenIdsInitPromise;
  const pool = getPgPool();
  if (!pool)
    return;
  _lastWrittenIdsInitPromise = _rdsInitLastWrittenIds(pool)
    .catch((err) => {
      console.warn("[rds] initLastWrittenIds 失败:", err.message);
    })
    .finally(() => {
      _lastWrittenIdsInitPromise = null;
    });
  return _lastWrittenIdsInitPromise;
}

/**
 * 轻量探测 client_matches 是否变化（供 backend 快照缓存失效）。
 */
export async function fetchClientMatchesMeta() {
  const pool = getPgPool();
  if (!pool)
    return null;
  try {
    return await _rdsFetchClientMatchesMeta(pool);
  }
  catch (err) {
    console.warn("[rds] fetchClientMatchesMeta 失败:", err.message);
    return null;
  }
}

/**
 * 从 RDS 读取 client_matches，按 start_time 升序排列。
 */
export async function fetchClientMatches() {
  const pool = getPgPool();
  if (!pool)
    return null;
  try {
    return await _rdsFetchClientMatches(pool);
  }
  catch (err) {
    console.warn("[rds] fetchClientMatches 失败:", err.message);
    return null;
  }
}

/**
 * align / ID 挂接专用。
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
  if (!pool)
    return null;
  try {
    return await _rdsFetchClientMatchesForAlign(pool);
  }
  catch (err) {
    console.warn("[rds] fetchClientMatchesForAlign 失败:", err.message);
    return null;
  }
}
