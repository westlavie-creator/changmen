/**
 * 过期行清理 — matcher 每小时调用；prune-stale.mjs 为手动/兜底 CLI。
 * client_matches 过期时不 DELETE，改为 list_status = -1（浏览器不返回）。
 */

import { CLIENT_MATCH_LIST_HIDDEN } from "./client_match_list_status.js";
import { getPgPool } from "./pg_pool.js";

export const STALE_MS = 60 * 60 * 1000;
/** 默认每小时整点等效 */
export const DEFAULT_PRUNE_INTERVAL_MS = 60 * 60 * 1000;

export function getStaleCutoffMs(now = Date.now()) {
  return now - STALE_MS;
}

const DELETE_SPECS = [
  { table: "platform_matches", column: "synced_at", key: "platform_matches" },
  { table: "platform_bets", column: "updated_at", key: "platform_bets" },
  { table: "live_timers", column: "updated_at", key: "live_timers" },
];

/** 过期后隐藏（list_status=-1），不删行 */
const HIDE_SPECS = [
  { table: "client_matches", column: "built_at", key: "client_matches" },
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
  for (const { table, column, key } of HIDE_SPECS) {
    const { rowCount } = await pool.query(
      `UPDATE ${table} SET list_status = $2
       WHERE ${column} < $1 AND list_status IS DISTINCT FROM $2`,
      [cutoff, CLIENT_MATCH_LIST_HIDDEN],
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
