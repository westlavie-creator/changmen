/**
 * 过期行清理 — matcher 每小时调用；prune-stale.mjs 为手动/兜底 CLI。
 * platform_matches / client_matches 过期行移入 history 表再删除。
 */

import { getPgPool } from "./pg_pool.js";

export const STALE_MS = 60 * 60 * 1000;
/** 默认每小时整点等效 */
export const DEFAULT_PRUNE_INTERVAL_MS = 60 * 60 * 1000;

export function getStaleCutoffMs(now = Date.now()) {
  return now - STALE_MS;
}

const DELETE_SPECS = [
  { table: "platform_bets", column: "updated_at", key: "platform_bets" },
  { table: "live_timers", column: "updated_at", key: "live_timers" },
];

const ARCHIVE_SPECS = [
  {
    table: "platform_matches",
    history: "platform_matches_history",
    column: "synced_at",
    key: "platform_matches",
    cols: "platform, source_match_id, source_game_id, start_time, home_id, home, away_id, away, bo, is_live, teams, synced_at, match_id",
  },
  {
    table: "client_matches",
    history: "client_matches_history",
    column: "built_at",
    key: "client_matches",
    cols: "id, title, game, game_id, start_time, bo, round, matchs, bets, reverse, built_at",
  },
];

function emptyCounts() {
  return {
    platform_matches: 0,
    platform_bets: 0,
    live_timers: 0,
    client_matches: 0,
  };
}

async function pruneRds(cutoff) {
  const pool = getPgPool();
  if (!pool)
    throw new Error("DATABASE_URL 未配置，无法 prune");
  const counts = emptyCounts();
  for (const { table, column, key } of DELETE_SPECS) {
    const { rowCount } = await pool.query(
      `DELETE FROM ${table} WHERE ${column} < $1`,
      [cutoff],
    );
    counts[key] = rowCount ?? 0;
  }
  for (const { table, history, column, key, cols } of ARCHIVE_SPECS) {
    const { rowCount } = await pool.query(
      `WITH moved AS (
         DELETE FROM ${table} WHERE ${column} < $1
         RETURNING *
       )
       INSERT INTO ${history} (${cols})
       SELECT ${cols} FROM moved`,
      [cutoff],
    );
    counts[key] = rowCount ?? 0;
  }
  return counts;
}

/**
 * @param {{ cutoffMs?: number }} opts
 * @returns {Promise<{ cutoff: number, rds: Record<string, number> }>}
 */
export async function pruneStaleRows(opts = {}) {
  const cutoff = opts.cutoffMs ?? getStaleCutoffMs();
  const rds = await pruneRds(cutoff);
  return { cutoff, rds };
}

export function formatPruneCounts(counts) {
  return `platform_matches=${counts.platform_matches} platform_bets=${counts.platform_bets} live_timers=${counts.live_timers} client_matches=${counts.client_matches}`;
}
