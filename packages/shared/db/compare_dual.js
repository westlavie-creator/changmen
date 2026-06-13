/**
 * dual 对账：Supabase vs RDS 各表行数（matcher 定时 / compare-dual.mjs CLI）。
 */

import { getDbMode } from "./db_mode.js";
import { supabaseAdmin } from "./client.js";
import { getPgPool } from "./pg_pool.js";

export const COMPARE_DUAL_TABLES = [
  "platform_matches",
  "platform_bets",
  "live_timers",
  "client_matches",
  "profiles",
  "orders",
];

async function countSupabase(table) {
  if (!supabaseAdmin) return null;
  const { count, error } = await supabaseAdmin
    .from(table)
    .select("*", { count: "exact", head: true });
  if (error) throw new Error(`supabase ${table}: ${error.message}`);
  return count ?? 0;
}

async function countRds(pool, table) {
  const { rows } = await pool.query(`SELECT COUNT(*)::int AS n FROM ${table}`);
  return rows[0]?.n ?? 0;
}

/**
 * dual 模式下对比行数；非 dual 返回 null。
 * @returns {Promise<null | { ok: boolean, mismatches: number, rows: Array<{ table: string, supabase: number, rds: number, delta: number }>, error?: string }>}
 */
export async function compareDualRowCounts() {
  const { isDual } = getDbMode();
  if (!isDual) return null;

  const pool = getPgPool("compare-dual");
  if (!supabaseAdmin) {
    return { ok: false, mismatches: 0, rows: [], error: "Supabase 未配置" };
  }
  if (!pool) {
    return { ok: false, mismatches: 0, rows: [], error: "RDS 未配置" };
  }

  const rows = [];
  let mismatches = 0;
  for (const table of COMPARE_DUAL_TABLES) {
    const supabase = await countSupabase(table);
    const rds = await countRds(pool, table);
    const delta = supabase - rds;
    if (delta !== 0) mismatches += 1;
    rows.push({ table, supabase, rds, delta });
  }

  return { ok: mismatches === 0, mismatches, rows };
}

/** 单行摘要，便于 matcher 日志 */
export function formatCompareDualOneLine(result) {
  if (!result) return null;
  if (result.error) return result.error;
  if (result.ok) return "全部表行数一致";
  const parts = result.rows
    .filter((r) => r.delta !== 0)
    .map((r) => `${r.table} delta=${r.delta}`);
  return `${result.mismatches} 张表不一致: ${parts.join(", ")}`;
}

/** CLI 多行报告 */
export function formatCompareDualReport(result) {
  if (!result) return ["[compare-dual] 非 dual 模式，跳过"];
  if (result.error) return [`[compare-dual] ${result.error}`];

  const lines = [
    "[compare-dual] Supabase vs RDS 行数对账",
    "table                  supabase    rds    delta",
    "─────────────────────────────────────────────────",
  ];
  for (const { table, supabase, rds, delta } of result.rows) {
    const mark = delta === 0 ? "" : "  ←";
    const pad = table.padEnd(22);
    lines.push(
      `${pad}${String(supabase).padStart(8)}  ${String(rds).padStart(5)}  ${String(delta).padStart(5)}${mark}`,
    );
  }
  lines.push("");
  if (result.ok) {
    lines.push("[compare-dual] 全部表行数一致");
  } else {
    lines.push(
      `[compare-dual] ${result.mismatches} 张表行数不一致（dual 双写延迟或历史导入差可致短暂偏差）`,
    );
  }
  return lines;
}
