#!/usr/bin/env node

/**
 * 创建系统登录用户
 * 用法：node scripts/create-user.js <用户名> <密码>
 *
 * AUTH_MODE=supabase — Supabase Auth（email 用户名@gamebet.local）
 * AUTH_MODE=jwt      — RDS users 表 + bcrypt（pgcrypto）
 */

import crypto from "node:crypto";
import "@changmen/db/load_env.js";
import {
  buildPgClientConfig,
  getSupabaseAdminClient,
  initDatabaseUrl,
  insertProfile,
} from "@changmen/db";
import pg from "@changmen/db/pg.js";

const AUTH_MODE = String(process.env.AUTH_MODE || "supabase").trim().toLowerCase();

async function createJwtUser(userName, password) {
  await initDatabaseUrl();
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error("缺少 DATABASE_URL，请在 apps/backend/.env 配置 DATABASE_URL_PUBLIC/INTERNAL");
    process.exit(1);
  }
  if (!process.env.JWT_SECRET || process.env.JWT_SECRET.length < 16) {
    console.error("缺少 JWT_SECRET（至少 16 字符）");
    process.exit(1);
  }

  const name = String(userName).trim();
  const now = Date.now();
  const client = new pg.Client(buildPgClientConfig(url));
  await client.connect();

  try {
    const existing = await client.query(
      "SELECT id FROM users WHERE lower(user_name) = lower($1)",
      [name],
    );
    const userId = existing.rows[0]?.id || crypto.randomUUID();

    await client.query(
      `INSERT INTO users (id, user_name, password_hash, metadata, created_at, updated_at)
       VALUES ($1, $2, crypt($3, gen_salt('bf')), '{}', $4, $4)
       ON CONFLICT (user_name) DO UPDATE SET
         password_hash = crypt($3, gen_salt('bf')),
         updated_at = EXCLUDED.updated_at`,
      [userId, name, password, now],
    );

    const ok = await insertProfile(userId, {
      id: userId,
      user_name: name,
      accounts: [],
      betting_config: {},
      collect_config: {},
      preferences: {},
      created_at: now,
      updated_at: now,
    });
    if (!ok) {
      console.error("users 已写入，但 profiles 插入失败");
      process.exit(1);
    }

    console.log("成功:", JSON.stringify({ id: userId, userName: name, auth: "jwt" }, null, 2));
  } finally {
    await client.end();
  }
}

async function createSupabaseUser(userName, password) {
  const supabase = getSupabaseAdminClient();
  const email = `${userName.toLowerCase()}@gamebet.local`;
  console.log(`创建用户: ${userName} (${email})`);

  const { data, error } = await supabase.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });

  if (error) {
    console.error("失败:", error.message);
    process.exit(1);
  }

  console.log(
    "成功:",
    JSON.stringify({ id: data.user.id, email: data.user.email, auth: "supabase" }, null, 2),
  );
}

async function main() {
  const [userName, password] = process.argv.slice(2);

  if (!userName || !password) {
    console.error("用法: node scripts/create-user.js <用户名> <密码>");
    process.exit(1);
  }

  if (AUTH_MODE === "jwt") {
    console.log(`创建用户 (JWT/RDS): ${userName}`);
    await createJwtUser(userName, password);
    return;
  }

  await createSupabaseUser(userName, password);
}

main().catch((err) => {
  console.error(err.message || err);
  process.exit(1);
});
