/**
 * client_matches 时间归档 — matcher 每小时兜底。
 * v1 ended_at 生命周期：任何 scope 都不得对 client_matches 做 built_at 搬家
 * （ended 行是身份/强制结束锚点；history 表也无 ended_at，搬出会导致复活）。
 * platform_* 仍可由 --legacy-platform / --all 清理。
 * archive-stale-client-matches.mjs（ops/migrations/）为手动/运维 CLI。
 */

import { getPgPool } from "./pg_pool.js";

export const ARCHIVE_STALE_MS = 60 * 60 * 1000;
/** 默认每小时整点等效 */
export const DEFAULT_CLIENT_MATCH_ARCHIVE_INTERVAL_MS = 60 * 60 * 1000;

/** matcher 循环默认：不再搬 client_matches（no-op） */
export const ARCHIVE_SCOPE_CLIENT = "client";
/** 运维兜底：含 platform_* / live_timers 时间清理（SaveMatch 快照上线前行为） */
export const ARCHIVE_SCOPE_LEGACY_PLATFORM = "legacy-platform";
/** 与 legacy-platform 相同：仅 platform_* / live_timers（不再搬 client_matches） */
export const ARCHIVE_SCOPE_ALL = "all";

export function getArchiveCutoffMs(now = Date.now()) {
  return now - ARCHIVE_STALE_MS;
}

const PLATFORM_DELETE_SPECS = [
  { table: "platform_bets", column: "updated_at", key: "platform_bets" },
  { table: "live_timers", column: "updated_at", key: "live_timers" },
];

const PLATFORM_ARCHIVE_SPECS = [
  {
    table: "platform_matches",
    history: "platform_matches_history",
    column: "synced_at",
    key: "platform_matches",
    cols: "platform, source_match_id, source_game_id, start_time, home_id, home, away_id, away, bo, is_live, teams, synced_at, match_id",
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

/** @returns {{ deleteSpecs: typeof PLATFORM_DELETE_SPECS, archiveSpecs: Array }} */
export function resolveArchiveSpecs(scope = ARCHIVE_SCOPE_CLIENT) {
  const wantPlatform = scope === ARCHIVE_SCOPE_ALL || scope === ARCHIVE_SCOPE_LEGACY_PLATFORM;
  // ended_at 生命周期：任何 scope 都不搬 client_matches（含历史 ALL）
  return {
    deleteSpecs: wantPlatform ? PLATFORM_DELETE_SPECS : [],
    archiveSpecs: wantPlatform ? [...PLATFORM_ARCHIVE_SPECS] : [],
  };
}

async function archiveRds(cutoff, scope) {
  const pool = getPgPool();
  if (!pool)
    throw new Error("DATABASE_URL 未配置，无法 archive");
  const { deleteSpecs, archiveSpecs } = resolveArchiveSpecs(scope);
  const counts = emptyCounts();
  for (const { table, column, key } of deleteSpecs) {
    const { rowCount } = await pool.query(
      `DELETE FROM ${table} WHERE ${column} < $1`,
      [cutoff],
    );
    counts[key] = rowCount ?? 0;
  }
  for (const { table, history, column, key, cols, whereExtra } of archiveSpecs) {
    const extra = whereExtra ? ` AND (${whereExtra})` : "";
    const { rowCount } = await pool.query(
      `WITH moved AS (
         DELETE FROM ${table} WHERE ${column} < $1${extra}
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
 * @param {{ cutoffMs?: number, scope?: string }} opts
 * @returns {Promise<{ cutoff: number, scope: string, rds: Record<string, number> }>}
 */
export async function archiveStaleRows(opts = {}) {
  const cutoff = opts.cutoffMs ?? getArchiveCutoffMs();
  const scope = opts.scope ?? ARCHIVE_SCOPE_CLIENT;
  const rds = await archiveRds(cutoff, scope);
  return { cutoff, scope, rds };
}

/** matcher 循环：client scope 现为 no-op（保留调用点与日志） */
export async function archiveStaleClientMatchRows(opts = {}) {
  return archiveStaleRows({ ...opts, scope: ARCHIVE_SCOPE_CLIENT });
}

export function formatArchiveCounts(counts) {
  return `platform_matches=${counts.platform_matches} platform_bets=${counts.platform_bets} live_timers=${counts.live_timers} client_matches=${counts.client_matches}`;
}
