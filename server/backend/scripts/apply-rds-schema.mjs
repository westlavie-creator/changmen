#!/usr/bin/env node
/**
 * 在香港轻量 / 已配置 DATABASE_URL 的环境执行 RDS 建表。
 *
 *   cd changmen/server/backend
 *   # .env 中设置 DATABASE_URL=postgresql://gamebet_app:...@pgm-....:5432/gamebet
 *   node scripts/apply-rds-schema.mjs
 *   node scripts/apply-rds-schema.mjs --with-cron   # 可选 pg_cron（默认由 matcher  prune）
 */

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import pg from "@changmen/db/pg.js";
import { initDatabaseUrl, buildPgClientConfig } from "@changmen/db";

const __dirname = dirname(fileURLToPath(import.meta.url));
const backendRoot = join(__dirname, "..");
const migrationsDir = join(backendRoot, "db", "migrations");

const withCron = process.argv.includes("--with-cron");

await initDatabaseUrl();
const url = process.env.DATABASE_URL;

if (!url) {
  console.error("缺少 DATABASE_URL，请在 server/backend/.env 中配置");
  process.exit(1);
}

function readSql(name) {
  return readFileSync(join(migrationsDir, name), "utf8");
}

async function main() {
  const client = new pg.Client(buildPgClientConfig(url, 30000));
  await client.connect();
  try {
    console.log("[rds] 执行 001_baseline.sql …");
    await client.query(readSql("001_baseline.sql"));

    console.log("[rds] 执行 003_money_logs.sql …");
    await client.query(readSql("003_money_logs.sql"));

    console.log("[rds] 执行 004_users_is_admin.sql …");
    await client.query(readSql("004_users_is_admin.sql"));

    console.log("[rds] 执行 005_client_matches_list_status.sql …");
    await client.query(readSql("005_client_matches_list_status.sql"));

    console.log("[rds] 执行 006_tag_platforms_players.sql …");
    await client.query(readSql("006_tag_platforms_players.sql"));

    console.log("[rds] 执行 007_platform_matches_is_live.sql …");
    await client.query(readSql("007_platform_matches_is_live.sql"));

    console.log("[rds] 执行 008_user_logs.sql …");
    await client.query(readSql("008_user_logs.sql"));

    console.log("[rds] 执行 009_orders_changmen_bet.sql …");
    await client.query(readSql("009_orders_changmen_bet.sql"));

    console.log("[rds] 执行 010_value_signals.sql …");
    await client.query(readSql("010_value_signals.sql"));

    console.log("[rds] 执行 011_odds_history.sql …");
    await client.query(readSql("011_odds_history.sql"));

    if (withCron) {
      console.log("[rds] 执行 002_prune_pg_cron.sql …");
      try {
        await client.query(readSql("002_prune_pg_cron.sql"));
        console.log("[rds] pg_cron 任务已注册");
      } catch (err) {
        console.warn("[rds] pg_cron 未启用（可改用 prune-stale.mjs）:", err.message);
      }
    }

    const tables = await client.query(`
      SELECT tablename FROM pg_tables
      WHERE schemaname = 'public'
      ORDER BY tablename
    `);
    console.log("[rds] 当前 public 表:", tables.rows.map((r) => r.tablename).join(", "));
    console.log("[rds] 完成");
  } finally {
    await client.end();
  }
}

main().catch((err) => {
  console.error("[rds] 失败:", err.message);
  process.exit(1);
});
