/**
 * 一次性整理 impl_supabase.js / impl_rds.js（脚本切换架构）。
 * 用法：node packages/db/scripts/finalize-impl.mjs
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const dbDir = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");

const SET_PLATFORM_MATCH_ID = `
/**
 * 回写 platform_matches.match_id（Supabase）。
 * @returns {Promise<{ updated: boolean, skipped: boolean, conflict: boolean }>}
 */
async function setPlatformMatchId(platform, sourceMatchId, matchId, opts = {}) {
  const onlyIfNull = opts.onlyIfNull !== false && opts.force !== true;
  const plat = String(platform);
  const srcId = String(sourceMatchId);
  const cmId = Number(matchId);
  if (!Number.isFinite(cmId)) return { updated: false, skipped: true, conflict: false };

  let updated = false;
  let skipped = false;
  let conflict = false;

  if (!supabaseAdmin) return { updated: false, skipped: true, conflict: false };

  const { data: existing, error: fetchErr } = await supabaseAdmin
    .from("platform_matches")
    .select("match_id")
    .eq("platform", plat)
    .eq("source_match_id", srcId)
    .maybeSingle();
  if (fetchErr) throw new Error("查询 platform_matches 失败: " + fetchErr.message);
  if (!existing) {
    skipped = true;
  } else {
    const cur =
      existing.match_id != null && existing.match_id !== "" ? Number(existing.match_id) : null;
    if (cur === cmId) skipped = true;
    else if (cur != null && cur !== cmId && onlyIfNull) conflict = true;
    else {
      let q = supabaseAdmin
        .from("platform_matches")
        .update({ match_id: cmId })
        .eq("platform", plat)
        .eq("source_match_id", srcId);
      if (onlyIfNull) q = q.is("match_id", null);
      const { error: updErr } = await q;
      if (updErr) throw new Error("回写 match_id 失败 (" + plat + ":" + srcId + "): " + updErr.message);
      updated = true;
    }
  }
  return { updated, skipped, conflict };
}
`;

function finalizeSupabase() {
  let s = fs.readFileSync(path.join(dbDir, "impl_supabase.js"), "utf8");

  s = s.replace(
    /function isRdsDualWrite\(\)[\s\S]*?^}\n\nfunction getPgPool\(\)/m,
    "function getPgPool()",
  );

  s = s.replace(
    /function getPgPool\(\) \{\n  const url = process\.env\.DATABASE_URL;\n  if \(!url\) return null;\n  if \(!isJwtMode\(\) && !isRdsDualWrite\(\)\) return null;/,
    "function getPgPool() {\n  const url = process.env.DATABASE_URL;\n  if (!url || !isJwtMode()) return null;",
  );

  s = s.replace(
    /    const why = isJwtMode\(\) \? "AUTH_MODE=jwt" : "RDS_DUAL_WRITE";/,
    "    const why = \"AUTH_MODE=jwt\";",
  );

  s = s.replace(
    /if \(isJwtMode\(\)\) \{\n  console\.log\("\[db\] AUTH_MODE=jwt[^"]*"\);\n\} else if \(isRdsDualWrite\(\)\) \{\n  console\.log\(\n    "\[db\] RDS_DUAL_WRITE=1[^"]*"\,\n  \);\n\}/,
    "if (isJwtMode()) {\n  console.log(\"[db] impl_supabase: AUTH_MODE=jwt（登录走 RDS users 表）\");\n} else {\n  console.log(\"[db] impl_supabase: 数据读写全走 Supabase\");\n}",
  );

  s = s.replace(
    /\/\*\* M3 迁 RDS：与 Supabase 并行写入（fire-and-forget） \*\/\nfunction _writeRds[\s\S]*?^\/\/ ── profiles/m,
    `// ── platform match_id 回写 ───────────────────────────────────────────\n${SET_PLATFORM_MATCH_ID}\n\n// ── profiles`,
  );

  s = s.replace(/\n  _writeRds\([^)]+\)[^\n]*/g, "");

  if (!s.includes("setPlatformMatchId")) {
    throw new Error("setPlatformMatchId missing after transform");
  }

  s = s.replace(
    /export \{\n  hasAdminAccess,/,
    "export {\n  hasAdminAccess,\n  setPlatformMatchId,",
  );

  s = s.replace(
    /^ \* Supabase 表操作层 — 项目所有 Supabase 读写集中于此。/m,
    " * impl_supabase — 数据读写全走 Supabase（由 GAMEBET_DB_SCRIPT=supabase 选择）",
  );

  fs.writeFileSync(path.join(dbDir, "impl_supabase.js"), s, "utf8");
  console.log("impl_supabase.js OK");
}

const RDS_BACKEND_BLOCK = `let _pgPool = null;

/** impl_rds：采集与业务表读写 RDS（由 GAMEBET_DB_SCRIPT=rds 启动脚本选择） */
function collectReadsFromRds() {
  return true;
}
function collectWritesToRds() {
  return true;
}
function collectWritesToSupabase() {
  return false;
}
function businessUsesRds() {
  return true;
}
function businessWritesToSupabase() {
  return false;
}
function businessWritesToRds() {
  return true;
}

function needsPgPool() {
  return !!process.env.DATABASE_URL;
}

function getPgPool() {
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.warn("[db] impl_rds: 未配置 DATABASE_URL");
    return null;
  }
  if (!_pgPool) {
    const { Pool } = requirePg();
    _pgPool = new Pool({ connectionString: url, max: 4 });
    const why = isJwtMode() ? "AUTH_MODE=jwt + rds" : "GAMEBET_DB_SCRIPT=rds";
    console.log("[db] RDS 连接池已就绪 (" + why + ")");
  }
  return _pgPool;
}

console.log(
  "[db] impl_rds: platform_* / live_timers / client_matches / profiles / orders 读写 RDS",
);
`;

function finalizeRds() {
  let s = fs.readFileSync(path.join(dbDir, "impl_rds.js"), "utf8");

  s = s.replace(
    /let _pgPool = null;[\s\S]*?^logDataBackendStartup\(\);/m,
    RDS_BACKEND_BLOCK,
  );

  s = s.replace(
    /async function clearClientMatchesOnStartup\(\) \{\n  const client = supabaseAdmin \|\| supabase\n  if \(!client\) return\n  try \{\n    await client\.from\('client_matches'\)\.delete\(\)\.neq\('id', 0\)\n  \} catch \(err\) \{\n    console\.warn\('\[supabase\] clearClientMatchesOnStartup 失败:', err\.message\)\n  \}\n\}/,
    `async function clearClientMatchesOnStartup() {
  const pool = getPgPool();
  if (!pool) return;
  try {
    await pool.query("DELETE FROM client_matches WHERE id != 0");
  } catch (err) {
    console.warn("[rds] clearClientMatchesOnStartup 失败:", err.message);
  }
}`,
  );

  s = s.replace(/\n  getDataBackend,\n/, "\n");

  s = s.replace(
    /^ \* Supabase 表操作层 — 项目所有 Supabase 读写集中于此。/m,
    " * impl_rds — 数据读写全走 RDS（由 GAMEBET_DB_SCRIPT=rds 选择）；matcher 队表仍可用 getServiceClient()",
  );

  fs.writeFileSync(path.join(dbDir, "impl_rds.js"), s, "utf8");
  console.log("impl_rds.js OK");
}

finalizeSupabase();
finalizeRds();
