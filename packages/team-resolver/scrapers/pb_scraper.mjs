/**
 * PB 平台队伍 slug 爬虫
 *
 * 遍历 euro/odds（live + prematch），提取队伍的 slug(englishName) + 显示名，
 * 写入 team_platform_maps（canonical_id 仅当已有手动映射时填入）。
 *
 * 凭证：仅使用 gamebet_backend/data/esport/platforms.json 中 PB 段（下注账号 token，
 * 由 npm run account:import-platform 写入）。不读取 to.txt、PB_GATEWAY/PB_TOKEN 等环境变量。
 *
 * 运行（在 changmen/ 或 team-resolver/ 下）：
 *   node team-resolver/scrapers/pb_scraper.mjs
 *   node team-resolver/scrapers/pb_scraper.mjs --dry-run
 */

import path from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import { upsertTeamPlatformMapsBatched } from "@changmen/db";
import { requirePlatform } from "@changmen/platform-adapter/loader/adapter_paths.js";
import { getGameCodeForPlatformId } from "@changmen/shared/catalog/game_catalog.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);

await import("@changmen/db/load_env.js");

const { loadAndCreatePlugin } = require("../team_db.js");
const { loadPlatformsJsonSession, fetchEuroOdds } = requirePlatform(
  "PB",
  "backend",
  "session.js",
);
const { parseEuroOddsPayload } = requirePlatform("PB", "backend", "core.js");

const DRY_RUN = process.argv.includes("--dry-run");

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

/** `${gameSlug}:${teamId}` → { gameSlug, teamId, teamName } */
function collectTeamsFromPayload(data) {
  const teams = new Map();
  const { matches } = parseEuroOddsPayload(data);
  for (const row of matches) {
    const gameSlug = String(row.gameCode || row.gameId || "").trim();
    if (!gameSlug) continue;
    for (const side of [row.home, row.away]) {
      if (!side?.id) continue;
      const key = `${gameSlug}:${side.id}`;
      if (teams.has(key)) continue;
      teams.set(key, {
        gameSlug,
        teamId: side.id,
        teamName: side.englishName || side.name || side.id,
      });
    }
  }
  return teams;
}

async function batchUpsert(rows) {
  if (!rows.length) return;
  const BATCH = 200;
  for (let i = 0; i < rows.length; i += BATCH) {
    const end = Math.min(i + BATCH, rows.length);
    await upsertTeamPlatformMapsBatched(rows.slice(i, end), BATCH);
    process.stdout.write(`\r  已写入 ${end} / ${rows.length} 行`);
    await sleep(100);
  }
  process.stdout.write("\n");
}

async function main() {
  console.log(
    DRY_RUN ? "[pb_scraper] 模式：dry-run（只打印）" : "[pb_scraper] 模式：写入队伍表（GAMEBET_DB_SCRIPT）",
  );
  console.log("[pb_scraper] 凭证来源：platforms.json PB（下注账号，非环境变量）");

  console.log("\n[pb_scraper] 加载 PB 会话...");
  const session = loadPlatformsJsonSession();
  console.log(`[pb_scraper] gateway: ${session.gateway}`);

  console.log("[pb_scraper] 拉取 euro/odds (live + prematch)...");
  const data = await fetchEuroOdds(session);
  const teams = collectTeamsFromPayload(data);
  console.log(`[pb_scraper] 共 ${teams.size} 个不重复队伍`);

  console.log("\n[pb_scraper] 加载 team_platform_maps 索引...");
  const plugin = await loadAndCreatePlugin();

  const manualMapped = [];
  const platformOnly = [];
  const skipped = [];

  for (const { gameSlug, teamId, teamName } of teams.values()) {
    const gameCode = getGameCodeForPlatformId("PB", gameSlug);
    if (!gameCode || gameCode === "unknown") {
      skipped.push({ gameSlug, teamId, teamName });
      continue;
    }

    const gbTeamId = plugin.lookupById("PB", teamId);
    const base = {
      platform: "PB",
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
    `\n[pb_scraper] 解析结果：手动 gb_team_id ${manualMapped.length} 个 / 仅平台记录 ${platformOnly.length} 个 / 跳过(游戏超范围) ${skipped.length} 个`,
  );

  if (platformOnly.length > 0) {
    console.log("\n[pb_scraper] 无 gb_team_id 队伍（前 20 条）：");
    platformOnly
      .slice(0, 20)
      .forEach((r) => console.log(`  [${r.game}] platform_id=${r.platform_id}  name="${r.platform_name}"`));
  }

  const toWrite = [...manualMapped, ...platformOnly];
  if (!DRY_RUN && toWrite.length > 0) {
    console.log(`\n[pb_scraper] 写入 team_platform_maps（${toWrite.length} 行）...`);
    await batchUpsert(toWrite);
    console.log("[pb_scraper] 写入完成");
  } else if (DRY_RUN) {
    console.log("\n[dry-run] 仅平台记录示例（前 5 条）：");
    platformOnly
      .slice(0, 5)
      .forEach((r) =>
        console.log(`  gb_team_id=NULL  [${r.game}] platform_id=${r.platform_id}  name="${r.platform_name}"`),
      );
  }

  console.log("\n✅ 完成");
}

main().catch((err) => {
  console.error("[pb_scraper] 致命错误:", err.message);
  process.exit(1);
});
