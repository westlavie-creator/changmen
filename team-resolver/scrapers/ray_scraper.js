"use strict";

/**
 * RAY 平台队伍 ID 爬虫
 *
 * 遍历 RAY API 的多个 match_type 分页，提取所有队伍的 team_id + team_name，
 * 通过 canonical_teams 名称匹配，将已识别的映射写入 team_platform_maps。
 *
 * 运行：
 *   node ray_scraper.js                   # 抓全部 match_type
 *   node ray_scraper.js --types=1,2,3     # 只抓指定 match_type
 *   node ray_scraper.js --dry-run         # 只打印，不写库
 */

const path = require("path");
require("dotenv").config({ path: path.join(__dirname, "../../gamebet_backend/.env") });

const { createClient } = require("@supabase/supabase-js");
const { login, rayGet } = require("../../gamebet_backend/platforms/ray/ray_session.js");
const { getGameCodeForPlatformId } = require("../../gamebet_backend/core/shared/game_catalog.js");
const { loadAndCreatePlugin } = require("../supabase_db.js");

// ── CLI ───────────────────────────────────────────────────────────────────────

const DRY_RUN = process.argv.includes("--dry-run");
const typesArg = (process.argv.find((a) => a.startsWith("--types=")) || "").split("=")[1];
const MATCH_TYPES = typesArg
  ? typesArg.split(",").map(Number).filter(Number.isFinite)
  : [1, 2, 3, 4, 5];

const MAX_PAGES = 500;
const REQUEST_DELAY_MS = 250;

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

// ── 抓取单个 match_type 的所有分页 ───────────────────────────────────────────

async function scrapeMatchType(session, matchType) {
  /** `${rayGameId}:${teamId}` → { rayGameId, teamId, teamName } */
  const teams = new Map();
  let totalMatches = 0;

  for (let page = 1; page <= MAX_PAGES; page++) {
    let result;
    try {
      const r = await rayGet(
        session.gateway,
        `/match?match_type=${matchType}&page=${page}`,
        session.token,
        session.origin
      );
      if (r.json.code !== 200) {
        if (page === 1) {
          process.stdout.write(`\r  match_type=${matchType}: API code=${r.json.code}，跳过\n`);
        }
        break;
      }
      result = r.json.result || [];
    } catch (err) {
      process.stdout.write(`\r  match_type=${matchType} page=${page}: ${err.message}，停止\n`);
      break;
    }

    if (result.length === 0) break;
    totalMatches += result.length;

    for (const raw of result) {
      const rayGameId = String(raw.game_id || "").trim();
      if (!rayGameId) continue;
      for (const t of raw.team || []) {
        const teamId = String(t.team_id || "").trim();
        const teamName = String(t.team_name || "").trim();
        if (!teamId || !teamName) continue;
        const key = `${rayGameId}:${teamId}`;
        if (!teams.has(key)) teams.set(key, { rayGameId, teamId, teamName });
      }
    }

    process.stdout.write(
      `\r  match_type=${matchType}: page ${page}, ${totalMatches} 场赛事, ${teams.size} 个不重复队伍`
    );

    if (result.length < 5) break; // 末页

    await sleep(REQUEST_DELAY_MS);
  }

  process.stdout.write("\n");
  return teams;
}

// ── 批量写库 ─────────────────────────────────────────────────────────────────

async function batchUpsert(rows) {
  if (!rows.length) return;
  const sb = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_KEY
  );
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
  console.log(DRY_RUN ? "[ray_scraper] 模式：dry-run（只打印）" : "[ray_scraper] 模式：写入 Supabase");
  console.log(`[ray_scraper] 将抓取 match_type: ${MATCH_TYPES.join(", ")}`);

  // 1. 连接 RAY
  console.log("\n[ray_scraper] 连接 RAY API...");
  const session = await login();
  console.log(`[ray_scraper] 已连接: ${session.gateway}`);

  // 2. 遍历所有 match_type
  const allTeams = new Map(); // `${rayGameId}:${teamId}` → { rayGameId, teamId, teamName }
  for (const mt of MATCH_TYPES) {
    process.stdout.write(`[ray_scraper] 抓取 match_type=${mt}...\n`);
    const teams = await scrapeMatchType(session, mt);
    console.log(`  → ${teams.size} 个不重复队伍`);
    for (const [k, v] of teams) {
      if (!allTeams.has(k)) allTeams.set(k, v);
    }
  }
  console.log(`\n[ray_scraper] 共抓取 ${allTeams.size} 个不重复队伍（跨所有 match_type）`);

  // 3. 加载 team-resolver 插件
  console.log("\n[ray_scraper] 加载 canonical_teams...");
  const plugin = await loadAndCreatePlugin();

  // 4. 逐个解析
  const resolved = [];   // canonical_id 已知
  const unresolved = []; // canonical_id = NULL（gameCode 已知但 canonical_teams 里没有）
  const skipped = [];    // gameCode 未知（超出我们追踪的游戏范围）

  for (const { rayGameId, teamId, teamName } of allTeams.values()) {
    const gameCode = getGameCodeForPlatformId("RAY", rayGameId);
    if (!gameCode) {
      skipped.push({ rayGameId, teamId, teamName });
      continue;
    }

    const canonId = plugin.lookupByName(gameCode, norm(teamName));
    if (canonId) {
      resolved.push({
        canonical_id: Number(canonId),
        platform: "RAY",
        platform_id: teamId,
        platform_name: teamName,
        game: gameCode,
        source: "scraper",
        confidence: 0.9,
      });
    } else {
      unresolved.push({
        canonical_id: null,
        platform: "RAY",
        platform_id: teamId,
        platform_name: teamName,
        game: gameCode,
        source: "scraper",
        confidence: 0.0,
      });
    }
  }

  console.log(
    `\n[ray_scraper] 解析结果：已识别 ${resolved.length} 个 / 待回填 ${unresolved.length} 个 / 跳过(游戏超范围) ${skipped.length} 个`
  );

  if (unresolved.length > 0) {
    console.log("\n[ray_scraper] 待回填队伍（前 20 条）：");
    unresolved.slice(0, 20).forEach((r) => console.log(`  platform_id=${r.platform_id}  name="${r.platform_name}"`));
  }

  // 5. 写库
  const toWrite = [...resolved, ...unresolved];
  if (!DRY_RUN && toWrite.length > 0) {
    console.log(`\n[ray_scraper] 写入 team_platform_maps（已识别 ${resolved.length} + 待回填 ${unresolved.length} = ${toWrite.length} 行）...`);
    await batchUpsert(toWrite);
    console.log("[ray_scraper] 写入完成");
  } else if (DRY_RUN) {
    console.log("\n[dry-run] 已识别示例（前 5 条）：");
    resolved.slice(0, 5).forEach((r) =>
      console.log(`  canonical_id=${r.canonical_id}  platform_id=${r.platform_id}  name="${r.platform_name}"`)
    );
    console.log("\n[dry-run] 待回填示例（前 5 条）：");
    unresolved.slice(0, 5).forEach((r) =>
      console.log(`  canonical_id=NULL  platform_id=${r.platform_id}  name="${r.platform_name}"`)
    );
  }

  console.log("\n✅ 完成");
}

main().catch((err) => {
  console.error("[ray_scraper] 致命错误:", err.message);
  process.exit(1);
});
