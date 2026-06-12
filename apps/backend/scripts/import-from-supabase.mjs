#!/usr/bin/env node
/**
 * M4：从 Supabase 导入 users / profiles / orders 到阿里云 RDS（不切流，可重复执行）
 *
 * 需要 apps/backend/.env：
 *   SUPABASE_URL + SUPABASE_SERVICE_KEY  — 拉 profiles、orders
 *   DATABASE_URL                         — 写入 RDS
 *   SUPABASE_DATABASE_URL（推荐）       — 从 auth.users 拷贝密码 hash；无则 users 用占位密码
 *
 * 用法（在香港轻量机上，与 RDS 内网同机）：
 *   cd changmen/apps/backend
 *   node scripts/import-from-supabase.mjs
 *   node scripts/import-from-supabase.mjs --dry-run
 *   node scripts/import-from-supabase.mjs --only profiles,orders
 */

import pg from "pg";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import path from "node:path";

import "../../../packages/shared/db/load_env.js";
import { supabaseAdmin } from "../../../packages/shared/db/client.js";

const require = createRequire(import.meta.url);
const __dirname = path.dirname(fileURLToPath(import.meta.url));

const args = new Set(process.argv.slice(2));
const dryRun = args.has("--dry-run");
const only = (() => {
  const raw = process.argv.find((a) => a.startsWith("--only="));
  if (!raw) return null;
  return new Set(raw.slice("--only=".length).split(",").map((s) => s.trim()).filter(Boolean));
})();
const want = (name) => !only || only.has(name);

const rdsUrl = process.env.DATABASE_URL;
const supaDbUrl = process.env.SUPABASE_DATABASE_URL || process.env.SUPABASE_DB_URL;

if (!rdsUrl) {
  console.error("缺少 DATABASE_URL");
  process.exit(1);
}
if (!supabaseAdmin) {
  console.error("缺少 SUPABASE_URL / SUPABASE_SERVICE_KEY，无法读 Supabase");
  process.exit(1);
}

const PAGE = 1000;

async function fetchAllProfiles() {
  const { data, error } = await supabaseAdmin
    .from("profiles")
    .select("id, user_name, accounts, betting_config, collect_config, preferences, created_at, updated_at")
    .order("user_name");
  if (error) throw new Error(`profiles: ${error.message}`);
  return data || [];
}

async function fetchAllOrders() {
  const all = [];
  let from = 0;
  for (;;) {
    const to = from + PAGE - 1;
    const { data, error } = await supabaseAdmin
      .from("orders")
      .select(
        "id, user_id, player_id, order_id, link, provider, match, bet, item, odds, bet_money, money, status, create_at, raw",
      )
      .order("id")
      .range(from, to);
    if (error) throw new Error(`orders: ${error.message}`);
    const batch = data || [];
    all.push(...batch);
    if (batch.length < PAGE) break;
    from += PAGE;
  }
  return all;
}

/** 直连 Supabase Postgres（Settings → Database → URI） */
async function fetchAuthUsersFromDb() {
  if (!supaDbUrl) return null;
  const client = new pg.Client({ connectionString: supaDbUrl });
  await client.connect();
  try {
    const { rows } = await client.query(`
      SELECT
        id::text,
        split_part(email, '@', 1) AS user_name,
        encrypted_password AS password_hash,
        COALESCE(raw_user_meta_data, '{}'::jsonb) AS metadata,
        (extract(epoch FROM created_at) * 1000)::bigint AS created_at,
        (extract(epoch FROM updated_at) * 1000)::bigint AS updated_at
      FROM auth.users
      WHERE encrypted_password IS NOT NULL
    `);
    return rows;
  } finally {
    await client.end();
  }
}

/** 无 DB 直连时：仅 id/email，密码占位（切 JWT 前需重置或补 SUPABASE_DATABASE_URL 重跑 users） */
async function fetchAuthUsersFromAdmin() {
  const all = [];
  let page = 1;
  const perPage = 1000;
  for (;;) {
    const { data, error } = await supabaseAdmin.auth.admin.listUsers({ page, perPage });
    if (error) throw new Error(`auth.listUsers: ${error.message}`);
    const batch = data?.users || [];
    for (const u of batch) {
      const email = u.email || "";
      const user_name = email.split("@")[0] || u.id;
      const created = u.created_at ? new Date(u.created_at).getTime() : Date.now();
      const updated = u.updated_at ? new Date(u.updated_at).getTime() : created;
      all.push({
        id: u.id,
        user_name,
        password_hash: null,
        metadata: u.user_metadata || {},
        created_at: created,
        updated_at: updated,
      });
    }
    if (batch.length < perPage) break;
    page += 1;
  }
  return all;
}

async function ensurePlaceholderPasswordHash(rds) {
  const { rows } = await rds.query(
    "SELECT crypt('changemen-migrate-reset-required', gen_salt('bf')) AS h",
  );
  return rows[0].h;
}

async function importUsers(rds, users, placeholderHash) {
  let n = 0;
  for (const u of users) {
    const hash = u.password_hash || placeholderHash;
    await rds.query(
      `INSERT INTO users (id, user_name, password_hash, metadata, created_at, updated_at)
       VALUES ($1, $2, $3, $4::jsonb, $5, $6)
       ON CONFLICT (id) DO UPDATE SET
         user_name = EXCLUDED.user_name,
         password_hash = CASE WHEN $7 THEN EXCLUDED.password_hash ELSE users.password_hash END,
         metadata = EXCLUDED.metadata,
         updated_at = EXCLUDED.updated_at`,
      [
        u.id,
        u.user_name,
        hash,
        JSON.stringify(u.metadata || {}),
        Number(u.created_at) || Date.now(),
        Number(u.updated_at) || Date.now(),
        Boolean(u.password_hash),
      ],
    );
    n += 1;
  }
  return n;
}

async function importProfiles(rds, profiles) {
  let n = 0;
  for (const p of profiles) {
    await rds.query(
      `INSERT INTO profiles (id, user_name, accounts, betting_config, collect_config, preferences, created_at, updated_at)
       VALUES ($1, $2, $3::jsonb, $4::jsonb, $5::jsonb, $6::jsonb, $7, $8)
       ON CONFLICT (id) DO UPDATE SET
         user_name = EXCLUDED.user_name,
         accounts = EXCLUDED.accounts,
         betting_config = EXCLUDED.betting_config,
         collect_config = EXCLUDED.collect_config,
         preferences = EXCLUDED.preferences,
         updated_at = EXCLUDED.updated_at`,
      [
        p.id,
        p.user_name,
        JSON.stringify(p.accounts ?? []),
        JSON.stringify(p.betting_config ?? {}),
        JSON.stringify(p.collect_config ?? {}),
        JSON.stringify(p.preferences ?? {}),
        Number(p.created_at) || Date.now(),
        Number(p.updated_at) || Date.now(),
      ],
    );
    n += 1;
  }
  return n;
}

async function importOrders(rds, orders) {
  let n = 0;
  for (const o of orders) {
    await rds.query(
      `INSERT INTO orders (
         id, user_id, player_id, order_id, link, provider, match, bet, item,
         odds, bet_money, money, status, create_at, raw
       ) OVERRIDING SYSTEM VALUE VALUES (
         $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15::jsonb
       )
       ON CONFLICT (user_id, order_id, player_id) DO UPDATE SET
         link = EXCLUDED.link,
         provider = EXCLUDED.provider,
         match = EXCLUDED.match,
         bet = EXCLUDED.bet,
         item = EXCLUDED.item,
         odds = EXCLUDED.odds,
         bet_money = EXCLUDED.bet_money,
         money = EXCLUDED.money,
         status = EXCLUDED.status,
         create_at = EXCLUDED.create_at,
         raw = EXCLUDED.raw`,
      [
        o.id,
        o.user_id,
        o.player_id,
        o.order_id,
        o.link ?? null,
        o.provider ?? null,
        o.match ?? null,
        o.bet ?? null,
        o.item ?? null,
        Number(o.odds) || 0,
        Number(o.bet_money) || 0,
        Number(o.money) || 0,
        o.status || "None",
        Number(o.create_at) || Date.now(),
        JSON.stringify(o.raw ?? {}),
      ],
    );
    n += 1;
  }
  if (n > 0) {
    await rds.query(
      `SELECT setval(
         pg_get_serial_sequence('orders', 'id'),
         GREATEST((SELECT MAX(id) FROM orders), 1)
       )`,
    );
  }
  return n;
}

async function main() {
  console.log("[import] 从 Supabase 读取…");
  const profiles = want("profiles") ? await fetchAllProfiles() : [];
  const orders = want("orders") ? await fetchAllOrders() : [];
  let authUsers = want("users") ? await fetchAuthUsersFromDb() : [];
  let usersPlaceholder = false;
  if (want("users") && !authUsers) {
    console.warn(
      "[import] 未配置 SUPABASE_DATABASE_URL，users 将用占位密码（切 JWT 前需重置或补配置后重跑 --only=users）",
    );
    authUsers = await fetchAuthUsersFromAdmin();
    usersPlaceholder = true;
  }

  console.log(
    `[import] Supabase: users=${authUsers?.length ?? 0} profiles=${profiles.length} orders=${orders.length}`,
  );

  if (dryRun) {
    console.log("[import] --dry-run 完成，未写入 RDS");
    return;
  }

  const rds = new pg.Client({ connectionString: rdsUrl });
  await rds.connect();
  try {
    let u = 0;
    let p = 0;
    let o = 0;
    if (want("users") && authUsers?.length) {
      const ph = usersPlaceholder ? await ensurePlaceholderPasswordHash(rds) : null;
      u = await importUsers(rds, authUsers, ph);
      console.log(`[import] users 写入 ${u} 行`);
    }
    if (want("profiles") && profiles.length) {
      p = await importProfiles(rds, profiles);
      console.log(`[import] profiles 写入 ${p} 行`);
    }
    if (want("orders") && orders.length) {
      o = await importOrders(rds, orders);
      console.log(`[import] orders 写入 ${o} 行`);
    }

    const counts = await rds.query(`
      SELECT
        (SELECT COUNT(*)::int FROM users) AS users,
        (SELECT COUNT(*)::int FROM profiles) AS profiles,
        (SELECT COUNT(*)::int FROM orders) AS orders
    `);
    console.log("[import] RDS 当前:", counts.rows[0]);
    console.log("[import] 完成（现网仍读 Supabase，未切流）");
  } finally {
    await rds.end();
  }
}

main().catch((err) => {
  console.error("[import] 失败:", err.message);
  process.exit(1);
});
