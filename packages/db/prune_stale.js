/**
 * 过期行清理 — matcher 每小时调用；prune-stale.mjs 为手动/兜底 CLI。
 *
 * 阈值：2 小时未刷新（与各平台最长采集间隔 + 缓冲一致）
 */

import { getPgPool } from "./pg_pool.js";

export const STALE_MS = 2 * 60 * 60 * 1000;
/** 默认每小时整点等效 */
export const DEFAULT_PRUNE_INTERVAL_MS = 60 * 60 * 1000;

export function getStaleCutoffMs(now = Date.now()) {
  return now - STALE_MS;
}

const TABLE_SPECS = [
  { table: "platform_matches", column: "synced_at", key: "platform_matches" },
  { table: "platform_bets", column: "updated_at", key: "platform_bets" },
  { table: "live_timers", column: "updated_at", key: "live_timers" },
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
  if (!pool) throw new Error("DATABASE_URL 未配置，无法 prune");
  const counts = emptyCounts();
  for (const { table, column, key } of TABLE_SPECS) {
    const { rowCount } = await pool.query(
      `DELETE FROM ${table} WHERE ${column} < $1`,
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
