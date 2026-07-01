/**
 * 从 RDS 加载队伍映射，构建同步查找插件。
 */

import { loadChangmenEnv } from "@changmen/storage/load_env.js";
import teamAliasesRaw from "@changmen/match-engine/teams/team_aliases.json" with { type: "json" };
import { resolveCanonicalTeamName } from "@changmen/match-engine/teams/canonical_ob_name.js";

loadChangmenEnv();

let _aliases = null;
function _getAliases() {
  if (!_aliases) {
    _aliases = Object.fromEntries(
      Object.entries(teamAliasesRaw).filter(([k]) => !k.startsWith("_")),
    );
  }
  return _aliases;
}

function _norm(name) {
  const base = String(name || "")
    .toLowerCase()
    .replace(/[·\-—_·•\s]+/g, " ")
    .replace(/[^\w\s一-鿿]/g, "")
    .trim()
    .replace(/\s+(?:esports?|gaming)$/i, "")
    .trim();
  return _getAliases()[base] || base;
}

export async function loadAndCreatePlugin() {
  const teamDb = await import("@changmen/db");

  const allTeams = await teamDb.fetchAllCanonicalTeams();

  const nameMap = new Map();
  const gbTeamNameMap = new Map();
  for (const team of allTeams) {
    const id = String(team.id);
    const g = team.game;
    const displayName = String(team.name || "").trim();
    if (team.gb_team_id != null && displayName) {
      gbTeamNameMap.set(String(team.gb_team_id), displayName);
    }
    const nameKey = _norm(team.name);
    if (nameKey) nameMap.set(`${g}:${nameKey}`, id);
    const ENABLE_ACRONYM_NAME_LOOKUP = false;
    if (ENABLE_ACRONYM_NAME_LOOKUP && team.acronym) {
      const acronymKey = _norm(team.acronym);
      if (acronymKey && acronymKey !== nameKey) nameMap.set(`${g}:${acronymKey}`, id);
    }
  }

  const allMaps = await teamDb.fetchAllTeamPlatformMaps();

  const idMap = new Map();
  const obNameByGbId = new Map();
  const _savedIds = new Set();

  for (const row of allMaps) {
    if (!row.venue_id) continue;
    const key = `${row.venue}:${row.venue_id}`;
    _savedIds.add(key);
    if (!row.gb_team_id) continue;
    idMap.set(key, String(row.gb_team_id));
    if (row.venue === "OB" && !obNameByGbId.has(String(row.gb_team_id))) {
      const obName = String(row.venue_name || "").trim();
      if (obName) obNameByGbId.set(String(row.gb_team_id), obName);
    }
  }

  const nameOnlyMap = new Map();
  const gbTeamIdByGameName = new Map();
  const gbTeamGameMap = new Map();
  for (const team of allTeams) {
    if (team.gb_team_id == null) continue;
    const g = team.game;
    gbTeamGameMap.set(String(team.gb_team_id), g);
    const displayName = resolveCanonicalTeamName(
      obNameByGbId.get(String(team.gb_team_id)),
      team.name,
    );
    if (!displayName) continue;
    const nameKey = _norm(displayName);
    if (nameKey) {
      nameMap.set(`${g}:${nameKey}`, String(team.id));
      gbTeamIdByGameName.set(`${g}:${nameKey}`, String(team.gb_team_id));
      if (!nameOnlyMap.has(nameKey)) nameOnlyMap.set(nameKey, String(team.gb_team_id));
    }
  }

  console.log(
    `[team-resolver] 加载完成 — ${allTeams.length} 支队伍 / ${nameMap.size} 个名称映射 / ${idMap.size} 个平台ID映射`,
  );

  function lookupByName(gameCode, normalizedName) {
    return nameMap.get(`${gameCode}:${normalizedName}`) || null;
  }

  function lookupById(platform, platformId) {
    if (!platformId) return null;
    return idMap.get(`${platform}:${platformId}`) || null;
  }

  function lookupCanonicalName(gbTeamId) {
    if (gbTeamId == null || gbTeamId === "") return null;
    const key = String(gbTeamId);
    return resolveCanonicalTeamName(obNameByGbId.get(key), gbTeamNameMap.get(key));
  }

  function saveMapping(gbTeamId, platform, platformId, platformName, gameCode) {
    const manualId = Number(gbTeamId);
    if (!platformId || !Number.isFinite(manualId) || manualId < 100000) return;
    const key = `${platform}:${platformId}`;
    if (_savedIds.has(key)) return;
    _savedIds.add(key);
    idMap.set(key, String(manualId));

    teamDb.saveTeamMappingFireAndForget({
      gb_team_id: manualId,
      platform,
      venue_id: String(platformId),
      venue_name: String(platformName || ""),
      game: gameCode || null,
      source: "auto",
      confidence: 1.0,
    });
  }

  function lookupGbTeamIdByNormalizedName(normalizedName) {
    return nameOnlyMap.get(normalizedName) || null;
  }

  function lookupGbTeamIdByNormalizedNameForGame(gameCode, normalizedName) {
    if (!gameCode || !normalizedName)
      return null;
    return gbTeamIdByGameName.get(`${gameCode}:${normalizedName}`) || null;
  }

  function lookupGameForGbTeamId(gbTeamId) {
    if (gbTeamId == null || gbTeamId === "")
      return null;
    return gbTeamGameMap.get(String(gbTeamId)) || null;
  }

  return {
    lookupByName,
    lookupById,
    lookupCanonicalName,
    lookupGbTeamIdByNormalizedName,
    lookupGbTeamIdByNormalizedNameForGame,
    lookupGameForGbTeamId,
    saveMapping,
  };
}
