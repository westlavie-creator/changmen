#!/usr/bin/env node
"use strict";

/**
 * 把本地 user_kv.json 数据同步到 Supabase 指定用户
 * 用法：node scripts/sync-user-data.js <用户名>
 * 示例：node scripts/sync-user-data.js tj01
 */

require("dotenv").config();
const fs = require("fs");
const path = require("path");
const { createClient } = require("@supabase/supabase-js");

const userName = process.argv[2];
if (!userName) {
  console.error("用法: node scripts/sync-user-data.js <用户名>");
  process.exit(1);
}

const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_KEY;
if (!url || !key) {
  console.error("缺少 SUPABASE_URL 或 SUPABASE_SERVICE_KEY");
  process.exit(1);
}

// 找 user_kv.json
const candidates = [
  path.join(__dirname, "..", "storage", "legacy", "esport", "user_kv.json"),
  path.join(__dirname, "..", "data", "esport", "user_kv.json"),
];
let kvPath = candidates.find(fs.existsSync);
if (!kvPath) {
  console.error("找不到 user_kv.json，试过:\n" + candidates.join("\n"));
  process.exit(1);
}

console.log("读取:", kvPath);
const kv = JSON.parse(fs.readFileSync(kvPath, "utf8"));

// 解析 accounts
let accounts = [];
try { accounts = JSON.parse(kv.ACCOUNT || "[]"); } catch {}

// 按列拆分
let betting_config = {};
try { betting_config = JSON.parse(kv.USERCONFIG || "{}"); } catch {}

let collect_config = {};
try { collect_config = JSON.parse(kv.CollectConfig || "{}"); } catch {}

const preferences = {};
for (const [k, v] of Object.entries(kv)) {
  if (!["ACCOUNT", "USERCONFIG", "CollectConfig"].includes(k)) {
    preferences[k] = v;
  }
}

console.log(`accounts      : ${accounts.length} 个`);
console.log(`betting_config: ${Object.keys(betting_config).join(", ")}`);
console.log(`collect_config: ${Object.keys(collect_config).join(", ")}`);
console.log(`preferences   : ${Object.keys(preferences).join(", ")}`);

async function main() {
  const supabase = createClient(url, key, { auth: { persistSession: false } });

  // 查找目标用户
  const { data: profiles, error: fetchErr } = await supabase
    .from("profiles")
    .select("id, user_name")
    .eq("user_name", userName);

  if (fetchErr) {
    console.error("查询失败:", fetchErr.message);
    process.exit(1);
  }
  if (!profiles?.length) {
    console.error(`用户 "${userName}" 不存在`);
    process.exit(1);
  }

  const profile = profiles[0];
  console.log(`找到用户: ${profile.user_name} (${profile.id})`);

  const { error: updateErr } = await supabase
    .from("profiles")
    .update({ accounts, betting_config, collect_config, preferences, updated_at: Date.now() })
    .eq("id", profile.id);

  if (updateErr) {
    console.error("同步失败:", updateErr.message);
    process.exit(1);
  }

  console.log(`同步成功 → ${userName}`);
}

main().catch((err) => {
  console.error(err.message || err);
  process.exit(1);
});
