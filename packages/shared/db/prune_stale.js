/**
 * 过期行清理 — 原 Supabase pg_cron 四类 prune-stale-* 任务。
 * 由 gamebet-matcher 每小时调用；prune-stale.mjs 为手动/兜底 CLI。
 *
 * 阈值：2 小时未刷新（与各平台最长采集间隔 + 缓冲一致）
 */

import { getDbMode } from "./db_mode.js";
import { getPgPool } from "./pg_pool.js";
import { supabaseAdmin } from "./client.js";

export const STALE_MS = 2 * 60 * 60 * 1000;
/** 默认与 pg_cron「每小时整点」等效 */
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
  if (!pool) throw new Error("DATABASE_URL 未配置，无法 prune RDS");
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

async function pruneSupabase(cutoff) {
  const sb = supabaseAdmin;
  if (!sb) throw new Error("Supabase 未配置，无法 prune Supabase");
  const counts = emptyCounts();
  for (const { table, column, key } of TABLE_SPECS) {
    const { error, count } = await sb.from(table).delete({ count: "exact" }).lt(column, cutoff);
    if (error) throw new Error(`${table}: ${error.message}`);
    counts[key] = count ?? 0;
  }
  return counts;
}

/**
 * @param {{ cutoffMs?: number }} opts
 * @returns {Promise<{ cutoff: number, rds: Record<string, number> | null, supabase: Record<string, number> | null }>}
 */
export async function pruneStaleRows(opts = {}) {
  const cutoff = opts.cutoffMs ?? getStaleCutoffMs();
  const { writesRds, writesSupabase } = getDbMode();
  const result = { cutoff, rds: null, supabase: null };

  if (writesRds) result.rds = await pruneRds(cutoff);
  if (writesSupabase) result.supabase = await pruneSupabase(cutoff);

  return result;
}

export function formatPruneCounts(counts) {
  return `platform_matches=${counts.platform_matches} platform_bets=${counts.platform_bets} live_timers=${counts.live_timers} client_matches=${counts.client_matches}`;
}
