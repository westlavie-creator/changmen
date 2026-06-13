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

require("../load_changmen_env.cjs");

const { getGameCodeForPlatformId } = require("@changmen/shared/catalog/game_catalog.mjs");
const { loadAndCreatePlugin } = require("../team_db.js");

let login;
let rayGet;

// ── CLI ───────────────────────────────────────────────────────────────────────

const DRY_RUN = process.argv.includes("--dry-run");
const typesArg = (process.argv.find((a) => a.startsWith("--types=")) || "").split("=")[1];
const MATCH_TYPES = typesArg
  ? typesArg.split(",").map(Number).filter(Number.isFinite)
  : [1, 2, 3, 4, 5];

const MAX_PAGES = 500;
const REQUEST_DELAY_MS = 250;

function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }

// ── 名称归一化（与 team_db.js 保持一致） ─────────────────────────────────

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
  const { upsertTeamPlatformMapsBatched } = await import("@changmen/db");
  const BATCH = 200;
  for (let i = 0; i < rows.length; i += BATCH) {
    const end = Math.min(i + BATCH, rows.length);
    await upsertTeamPlatformMapsBatched(rows.slice(i, end), BATCH);
    process.stdout.write(`\r  已写入 ${end} / ${rows.length} 行`);
    await sleep(100);
  }
  process.stdout.write("\n");
}

// ── 主流程 ────────────────────────────────────────────────────────────────────

async function main() {
  const { requirePlatform } = await import("@changmen/platform-adapter/loader/adapter_paths.js");
  ({ login, rayGet } = requirePlatform("RAY", "backend", "session.js"));

  console.log(DRY_RUN ? "[ray_scraper] 模式：dry-run（只打印）" : "[ray_scraper] 模式：写入 RDS");
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

  // 4. 逐个解析（gb_team_id 仅来自手动映射 lookupById，名称匹配不再写入 maps）
  const manualMapped = [];
  const platformOnly = [];
  const skipped = [];

  for (const { rayGameId, teamId, teamName } of allTeams.values()) {
    const gameCode = getGameCodeForPlatformId("RAY", rayGameId);
    if (!gameCode) {
      skipped.push({ rayGameId, teamId, teamName });
      continue;
    }

    const gbTeamId = plugin.lookupById("RAY", teamId);
    const base = {
      platform: "RAY",
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
    `\n[ray_scraper] 解析结果：手动 gb_team_id ${manualMapped.length} 个 / 仅平台记录 ${platformOnly.length} 个 / 跳过(游戏超范围) ${skipped.length} 个`
  );

  if (platformOnly.length > 0) {
    console.log("\n[ray_scraper] 无 gb_team_id 队伍（前 20 条）：");
    platformOnly.slice(0, 20).forEach((r) => console.log(`  platform_id=${r.platform_id}  name="${r.platform_name}"`));
  }

  // 5. 写库
  const toWrite = [...manualMapped, ...platformOnly];
  if (!DRY_RUN && toWrite.length > 0) {
    console.log(`\n[ray_scraper] 写入 team_platform_maps（${toWrite.length} 行）...`);
    await batchUpsert(toWrite);
    console.log("[ray_scraper] 写入完成");
  } else if (DRY_RUN) {
    console.log("\n[dry-run] 手动映射示例（前 5 条）：");
    manualMapped.slice(0, 5).forEach((r) =>
      console.log(`  gb_team_id=${r.canonical_id}  platform_id=${r.platform_id}  name="${r.platform_name}"`)
    );
    console.log("\n[dry-run] 仅平台记录示例（前 5 条）：");
    platformOnly.slice(0, 5).forEach((r) =>
      console.log(`  gb_team_id=NULL  platform_id=${r.platform_id}  name="${r.platform_name}"`)
    );
  }

  console.log("\n✅ 完成");
}

main().catch((err) => {
  console.error("[ray_scraper] 致命错误:", err.message);
  process.exit(1);
});
