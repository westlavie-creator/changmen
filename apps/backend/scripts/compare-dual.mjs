#!/usr/bin/env node
/**
 * dual 对账：Supabase vs RDS 各表行数
 *
 *   cd changmen/apps/backend && node scripts/compare-dual.mjs
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";
import { supabaseAdmin } from "../../../packages/shared/db/client.js";
import { getPgPool } from "../../../packages/shared/db/pg_pool.js";
import { initDatabaseUrl } from "../../../packages/shared/db/resolve_database_url.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const envPath = path.join(__dirname, "..", ".env");
if (fs.existsSync(envPath)) dotenv.config({ path: envPath });

await initDatabaseUrl();

const TABLES = [
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

const pool = getPgPool("compare-dual");
if (!supabaseAdmin) {
  console.error("[compare-dual] 未配置 Supabase（SUPABASE_URL + SERVICE_KEY）");
  process.exit(1);
}
if (!pool) {
  console.error("[compare-dual] 未配置 RDS（DATABASE_URL 或 PUBLIC/INTERNAL）");
  process.exit(1);
}

console.log("[compare-dual] Supabase vs RDS 行数对账\n");
console.log("table                  supabase    rds    delta");
console.log("─────────────────────────────────────────────────");

let mismatches = 0;
for (const table of TABLES) {
  const sb = await countSupabase(table);
  const rds = await countRds(pool, table);
  const delta = sb - rds;
  const mark = delta === 0 ? "" : "  ←";
  if (delta !== 0) mismatches += 1;
  const pad = table.padEnd(22);
  console.log(`${pad}${String(sb).padStart(8)}  ${String(rds).padStart(5)}  ${String(delta).padStart(5)}${mark}`);
}

await pool.end();

console.log("");
if (mismatches === 0) {
  console.log("[compare-dual] 全部表行数一致");
} else {
  console.log(`[compare-dual] ${mismatches} 张表行数不一致（dual 双写延迟或历史导入差可致短暂偏差）`);
  process.exitCode = 1;
}
