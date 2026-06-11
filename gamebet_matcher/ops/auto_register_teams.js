"use strict";

/**
 * rebuild 时自动收录 TF / OB / RAY / IA 平台尚未在 team_platform_maps 中的队伍。
 * 仅写入待识别记录（canonical_id = NULL），不分配 gb_team_id。
 */

const { getGameCodeForPlatformId } = require("../../shared/catalog/game_catalog");

const AUTO_REGISTER_PLATFORMS = new Set(["TF", "OB", "RAY", "IA"]);
const UPSERT_BATCH = 200;

function normalizePlatformId(id) {
  if (id == null || id === "") return "";
  return String(id).trim();
}

function parseTeamsArray(teams) {
  if (Array.isArray(teams)) return teams;
  if (typeof teams === "string") {
    try {
      return JSON.parse(teams);
    } catch {
      return [];
    }
  }
  return [];
}

function addCandidate(candidates, platform, platformId, platformName, gameCode) {
  const pid = normalizePlatformId(platformId);
  if (!pid || !gameCode || gameCode === "unknown") return;
  const key = `${platform}:${pid}`;
  if (candidates.has(key)) return;
  const name = String(platformName || "").trim() || pid;
  candidates.set(key, {
    platform: String(platform),
    platform_id: pid,
    platform_name: name,
    game: gameCode,
    source: "auto",
    confidence: 1.0,
  });
}

/** 从 platform_matches 原始结构收集待收录队伍 */
function collectTeamCandidates(matchesRaw) {
  const candidates = new Map();

  for (const [platform, block] of Object.entries(matchesRaw || {})) {
    if (!AUTO_REGISTER_PLATFORMS.has(platform)) continue;
    const list = Array.isArray(block) ? block : Object.values(block || {});
    for (const m of list) {
      if (!m) continue;
      const sourceGameId = String(m.SourceGameID ?? m.source_game_id ?? "");
      const gameCode = getGameCodeForPlatformId(platform, sourceGameId);
      if (!gameCode || gameCode === "unknown") continue;

      addCandidate(candidates, platform, m.HomeID ?? m.home_id, m.Home ?? m.home, gameCode);
      addCandidate(candidates, platform, m.AwayID ?? m.away_id, m.Away ?? m.away, gameCode);

      for (const t of parseTeamsArray(m.Teams ?? m.teams)) {
        addCandidate(
          candidates,
          platform,
          t.TeamID ?? t.team_id ?? t.teamId ?? t.id,
          t.Name ?? t.name ?? t.TeamName ?? t.team_name,
          gameCode,
        );
      }
    }
  }

  return candidates;
}

async function loadExistingKeys(supabase, candidates) {
  const existing = new Set();
  const byPlatform = new Map();
  for (const row of candidates.values()) {
    if (!byPlatform.has(row.platform)) byPlatform.set(row.platform, []);
    byPlatform.get(row.platform).push(row.platform_id);
  }

  for (const [platform, ids] of byPlatform) {
    for (let i = 0; i < ids.length; i += UPSERT_BATCH) {
      const batch = ids.slice(i, i + UPSERT_BATCH);
      const { data, error } = await supabase
        .from("team_platform_maps")
        .select("platform_id")
        .eq("platform", platform)
        .in("platform_id", batch);
      if (error) throw new Error(`查询 team_platform_maps 失败: ${error.message}`);
      for (const row of data || []) {
        existing.add(`${platform}:${row.platform_id}`);
      }
    }
  }

  return existing;
}

/**
 * @param {Record<string, unknown>} matchesRaw fetchPlatformMatches() 返回值
 * @returns {{ scanned: number, registered: number }}
 */
async function autoRegisterTeams(matchesRaw) {
  const sb = require("../../shared/db/supabase");
  const client = sb.getServiceClient();
  if (!client) return { scanned: 0, registered: 0 };

  const candidates = collectTeamCandidates(matchesRaw);
  if (!candidates.size) return { scanned: 0, registered: 0 };

  const existing = await loadExistingKeys(client, candidates);
  const toWrite = [...candidates.values()].filter(
    (row) => !existing.has(`${row.platform}:${row.platform_id}`),
  );
  if (!toWrite.length) return { scanned: candidates.size, registered: 0 };

  let registered = 0;
  for (let i = 0; i < toWrite.length; i += UPSERT_BATCH) {
    const batch = toWrite.slice(i, i + UPSERT_BATCH);
    const { error } = await client
      .from("team_platform_maps")
      .upsert(batch, { onConflict: "platform,platform_id", ignoreDuplicates: true });
    if (error) throw new Error(`自动收录队伍失败: ${error.message}`);
    registered += batch.length;
  }

  if (registered > 0) {
    console.log(`[matcher] 自动收录 ${registered} 条平台队伍（TF/OB/RAY/IA）`);
  }

  return { scanned: candidates.size, registered };
}

module.exports = { autoRegisterTeams, AUTO_REGISTER_PLATFORMS };
