#!/usr/bin/env node

/**
 * 创建系统登录用户（Supabase Auth）
 * 用法：node scripts/create-user.js <用户名> <密码>
 * 示例：node scripts/create-user.js tj01 abc123456
 */

import "@changmen/db/load_env.js";
import { getSupabaseAdminClient } from "@changmen/db";

async function main() {
  const [userName, password] = process.argv.slice(2);

  if (!userName || !password) {
    console.error("用法: node scripts/create-user.js <用户名> <密码>");
    process.exit(1);
  }

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
    JSON.stringify({ id: data.user.id, email: data.user.email }, null, 2),
  );
}

main().catch((err) => {
  console.error(err.message || err);
  process.exit(1);
});
