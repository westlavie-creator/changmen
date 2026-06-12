"use strict";

/**
 * OB 平台队伍 ID 爬虫
 *
 * 数据来源：
 *   flag=6          → 全量历史赛事（~2700 场，一次返回）
 *   flag=5 day=1~N  → 逐日已结束赛事（每天 ~20 场，默认往前 60 天）
 *
 * 运行：
 *   node ob_scraper.js                  # flag=6 + 过去 60 天
 *   node ob_scraper.js --days=30        # flag=6 + 过去 30 天
 *   node ob_scraper.js --no-flag6       # 仅 flag=5 逐日
 *   node ob_scraper.js --dry-run        # 只打印，不写库
 */

const path = require("path");
require("dotenv").config({ path: path.join(__dirname, "../../../apps/backend/.env") });

const { createClient } = require("@supabase/supabase-js");
const { requirePlatform } = require("../../../apps/backend/core/shared/adapter_paths.js");
const { login, obGet } = requirePlatform("OB", "backend", "session.js");
const { getGameCodeForPlatformId } = require("../../shared/catalog/game_catalog.mjs");
const { loadAndCreatePlugin } = require("../supabase_db.js");

// ── CLI ───────────────────────────────────────────────────────────────────────

const DRY_RUN = process.argv.includes("--dry-run");
const NO_FLAG6 = process.argv.includes("--no-flag6");
const daysArg = (process.argv.find((a) => a.startsWith("--days=")) || "").split("=")[1];
const HISTORY_DAYS = daysArg ? Math.max(1, Number(daysArg) || 60) : 60;

const REQUEST_DELAY_MS = 300;

function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }

// ── 名称归一化（与 supabase_db.js 保持一致） ─────────────────────────────────

function norm(name) {
  return String(name || "")
    .toLowerCase()
    .replace(/[·\-—_·•\s]+/g, " ")
    .replace(/[^\w\s一-鿿]/g, "")
    .trim()
    .replace(/\s+(?:esports?|gaming)$/i, "")
    .trim();
}

// ── OB 字段解析 ──────────────────────────────────────────────────────────────

function cleanObText(v) {
  return String(v || "").replace(/&nbsp;/g, " ").trim();
}

/** 从 game/index 一行提取两队信息 */
function extractTeams(item) {
  const names = cleanObText(item.match_team).split(",").map((s) => s.trim()).filter(Boolean);
  const ids = String(item.team_id || "").split(",").map((s) => s.trim()).filter(Boolean);
  const gameId = String(item.game_id || "").trim();
  const result = [];
  for (let i = 0; i < Math.min(names.length, ids.length, 2); i++) {
    if (names[i] && ids[i]) result.push({ gameId, teamId: ids[i], teamName: names[i] });
  }
  return result;
}

// ── 抓取函数 ──────────────────────────────────────────────────────────────────

/** flag=6：全量历史赛事，一次性返回所有 */
async function scrapeFlag6(session) {
  process.stdout.write("[ob_scraper] 抓取 flag=6（全量历史）...\n");
  const r = await obGet(session.gateway, "/game/index?game_id=0&flag=6&day=0", session.token, session.lang);
  if (r.json.status === "false") {
    console.log("  flag=6 失败:", r.json.data);
    return new Map();
  }
  const data = r.json.data || [];
  const teams = new Map();
  for (const item of data) {
    for (const t of extractTeams(item)) {
      const key = `${t.gameId}:${t.teamId}`;
      if (!teams.has(key)) teams.set(key, t);
    }
  }
  console.log(`  flag=6: ${data.length} 场赛事, ${teams.size} 个不重复队伍`);
  return teams;
}

/** flag=5 day=1~N：逐日已结束赛事 */
async function scrapeFlag5(session, days) {
  const teams = new Map();
  process.stdout.write(`[ob_scraper] 抓取 flag=5 day=1~${days}（逐日历史）...\n`);
  for (let day = 1; day <= days; day++) {
    await sleep(REQUEST_DELAY_MS);
    try {
      const r = await obGet(
        session.gateway,
        `/game/index?game_id=0&flag=5&day=${day}`,
        session.token,
        session.lang
      );
      if (r.json.status === "false") {
        process.stdout.write(`\r  day=${day}: ${r.json.data} — 停止`);
        break;
      }
      const data = r.json.data || [];
      for (const item of data) {
        for (const t of extractTeams(item)) {
          const key = `${t.gameId}:${t.teamId}`;
          if (!teams.has(key)) teams.set(key, t);
        }
      }
      process.stdout.write(`\r  day=${day}/${days}: ${data.length} 场, 累计 ${teams.size} 个不重复队伍  `);
    } catch (err) {
      process.stdout.write(`\r  day=${day}: ERR ${err.message.slice(0, 50)}\n`);
    }
  }
  process.stdout.write("\n");
  return teams;
}

// ── 批量写库 ─────────────────────────────────────────────────────────────────

async function batchUpsert(rows) {
  if (!rows.length) return;
  const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);
  const BATCH = 200;
  for (let i = 0; i < rows.length; i += BATCH) {
    const chunk = rows.slice(i, i + BATCH);
    let lastErr;
    for (let attempt = 0; attempt < 3; attempt++) {
      const { error } = await sb
        .from("team_platform_maps")
        .upsert(chunk, { onConflict: "platform,platform_id" });
      if (!error) { lastErr = null; break; }
      lastErr = error;
      await sleep(1000 * (attempt + 1));
    }
    if (lastErr) throw lastErr;
    process.stdout.write(`\r  已写入 ${Math.min(i + BATCH, rows.length)} / ${rows.length} 行`);
    await sleep(100);
  }
  process.stdout.write("\n");
}

// ── 主流程 ────────────────────────────────────────────────────────────────────

async function main() {
  console.log(DRY_RUN ? "[ob_scraper] 模式：dry-run（只打印）" : "[ob_scraper] 模式：写入 Supabase");

  // 1. 登录
  console.log("\n[ob_scraper] 登录 OB...");
  const session = await login();
  console.log(`[ob_scraper] 已连接: ${session.gateway}`);

  // 2. 抓取
  const allTeams = new Map();

  if (!NO_FLAG6) {
    const t6 = await scrapeFlag6(session);
    for (const [k, v] of t6) if (!allTeams.has(k)) allTeams.set(k, v);
    await sleep(REQUEST_DELAY_MS);
  }

  const t5 = await scrapeFlag5(session, HISTORY_DAYS);
  for (const [k, v] of t5) if (!allTeams.has(k)) allTeams.set(k, v);

  console.log(`\n[ob_scraper] 共抓取 ${allTeams.size} 个不重复队伍`);

  // 3. 加载 team-resolver
  console.log("\n[ob_scraper] 加载 canonical_teams...");
  const plugin = await loadAndCreatePlugin();

  // 4. 解析（gb_team_id 仅来自手动映射 lookupById）
  const manualMapped = [];
  const platformOnly = [];
  const skipped = [];

  for (const { gameId, teamId, teamName } of allTeams.values()) {
    const gameCode = getGameCodeForPlatformId("OB", gameId);
    if (!gameCode) { skipped.push({ gameId, teamId, teamName }); continue; }

    const gbTeamId = plugin.lookupById("OB", teamId);
    const base = {
      platform: "OB",
      platform_id: teamId,
      platform_name: teamName,
      game: gameCode,
      source: "scraper",
    };
    if (gbTeamId) {
      manualMapped.push({ ...base, canonical_id: Number(gbTeamId), confidence: 1.0 });
    } else {
      platformOnly.push({ ...base, canonical_id: null, confidence: 0.0 });
    }
  }

  console.log(
    `\n[ob_scraper] 解析结果：手动 gb_team_id ${manualMapped.length} / 仅平台记录 ${platformOnly.length} / 跳过(游戏超范围) ${skipped.length}`
  );

  if (platformOnly.length > 0) {
    console.log("\n[ob_scraper] 无 gb_team_id 队伍（前 20 条）：");
    platformOnly.slice(0, 20).forEach((r) =>
      console.log(`  platform_id=${r.platform_id}  name="${r.platform_name}"`)
    );
  }

  // 5. 写库
  const toWrite = [...manualMapped, ...platformOnly];
  if (!DRY_RUN && toWrite.length > 0) {
    console.log(`\n[ob_scraper] 写入 team_platform_maps（${toWrite.length} 行）...`);
    await batchUpsert(toWrite);
    console.log("[ob_scraper] 写入完成");
  } else if (DRY_RUN) {
    console.log("\n[dry-run] 手动映射示例（前 5 条）：");
    manualMapped.slice(0, 5).forEach((r) =>
      console.log(`  gb_team_id=${r.canonical_id}  platform_id=${r.platform_id}  name="${r.platform_name}"`)
    );
    if (platformOnly.length) {
      console.log("[dry-run] 仅平台记录示例（前 5 条）：");
      platformOnly.slice(0, 5).forEach((r) =>
        console.log(`  gb_team_id=NULL  platform_id=${r.platform_id}  name="${r.platform_name}"`)
      );
    }
  }

  console.log("\n✅ 完成");
}

main().catch((err) => {
  console.error("[ob_scraper] 致命错误:", err.message);
  process.exit(1);
});
