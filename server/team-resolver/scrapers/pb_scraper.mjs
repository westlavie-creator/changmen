/**
 * PB ???? slug ??
 *
 * ?? euro/odds?live + prematch??????ù?slug(englishName) + ????
 * ?? team_platform_maps?canonical_id ????????????ù? *
 * ?????? gamebet_backend/data/esport/platforms.json ù?PB ?????? tokenù? * ù?npm run account:import-platform ??????? to.txt?PB_GATEWAY/PB_TOKEN ?????ù? *
 * ???? changmen/ ù?team-resolver/ ??ù? *   node team-resolver/scrapers/pb_scraper.mjs
 *   node team-resolver/scrapers/pb_scraper.mjs --dry-run
 */

import path from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import { upsertTeamPlatformMapsBatched } from "@changmen/db";
import { requirePlatform } from "@changmen/platform-adapter/loader/adapter_paths.js";
import { getGameCodeForPlatformId } from "@changmen/shared/catalog/game_catalog.mjs";
import { formatPbTeamPlatformId } from "@changmen/shared/catalog/pb_team_platform_id.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);

const { loadAndCreatePlugin } = require("../team_db.js");
const { loadPlatformsJsonSession, fetchEuroOdds } = requirePlatform(
  "PB", "node",
  "session.js",
);
const { parseEuroOddsPayload } = requirePlatform("PB", "node", "core.js");

const DRY_RUN = process.argv.includes("--dry-run");

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

/** `${gameSlug}:${teamId}` ù?{ gameSlug, teamId, teamName } */
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
    process.stdout.write(`\r  ??ù?${end} / ${rows.length} ?`);
    await sleep(100);
  }
  process.stdout.write("\n");
}

async function main() {
  console.log(
    DRY_RUN ? "[pb_scraper] ???dry-run????ù? : "[pb_scraper] ?????????GAMEBET_DB_SCRIPTù?,
  );
  console.log("[pb_scraper] ?????platforms.json PB????????????");

  console.log("\n[pb_scraper] ?? PB ??...");
  const session = loadPlatformsJsonSession();
  console.log(`[pb_scraper] gateway: ${session.gateway}`);

  console.log("[pb_scraper] ?? euro/odds (live + prematch)...");
  const data = await fetchEuroOdds(session);
  const teams = collectTeamsFromPayload(data);
  console.log(`[pb_scraper] ù?${teams.size} ??????`);

  console.log("\n[pb_scraper] ?? team_platform_maps ??...");
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

    const gbTeamId = plugin.lookupById("PB", formatPbTeamPlatformId(gameSlug, teamId));
    const storedPlatformId = formatPbTeamPlatformId(gameSlug, teamId);
    const base = {
      platform: "PB",
      platform_id: storedPlatformId,
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
    `\n[pb_scraper] ??????ù?gb_team_id ${manualMapped.length} ù?/ ????ù?${platformOnly.length} ù?/ ??(????ù? ${skipped.length} ?`,
  );

  if (platformOnly.length > 0) {
    console.log("\n[pb_scraper] ù?gb_team_id ???? 20 ??ù?);
    platformOnly
      .slice(0, 20)
      .forEach((r) => console.log(`  [${r.game}] platform_id=${r.platform_id}  name="${r.platform_name}"`));
  }

  const toWrite = [...manualMapped, ...platformOnly];
  if (!DRY_RUN && toWrite.length > 0) {
    console.log(`\n[pb_scraper] ?? team_platform_mapsù?{toWrite.length} ??...`);
    await batchUpsert(toWrite);
    console.log("[pb_scraper] ????");
  } else if (DRY_RUN) {
    console.log("\n[dry-run] ????????ù?5 ??ù?);
    platformOnly
      .slice(0, 5)
      .forEach((r) =>
        console.log(`  gb_team_id=NULL  [${r.game}] platform_id=${r.platform_id}  name="${r.platform_name}"`),
      );
  }

  console.log("\nù???");
}

main().catch((err) => {
  console.error("[pb_scraper] ????:", err.message);
  process.exit(1);
});
