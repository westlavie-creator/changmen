"use strict";

/**
 * 从数据库加载队伍映射，构建同步查找插件（受 GAMEBET_DB_SCRIPT 控制）。
 *
 * 插件对象接口：
 *   lookupByName(gameCode, normalizedName) → canonical_teams.id string | null（内部合并用）
 *   lookupById(platform, platformId)       → gb_team_id string | null（仅手动映射）
 *   saveMapping(gbTeamId, ...)            → 仅当 gbTeamId 为手动 ID 时写 maps
 */

const path = require("path");
require("dotenv").config({ path: path.join(__dirname, "../../apps/backend/.env") });

// 加载 team_aliases.json（单源：packages/match-engine/teams/）
let _aliases = null;
function _getAliases() {
  if (!_aliases) {
    try {
      const raw = require("../match-engine/teams/team_aliases.json");
      _aliases = Object.fromEntries(Object.entries(raw).filter(([k]) => !k.startsWith("_")));
    } catch {
      _aliases = {};
    }
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

async function loadAndCreatePlugin() {
  const teamDb = await import("@changmen/db");

  const allTeams = await teamDb.fetchAllCanonicalTeams();

  const nameMap = new Map(); // `${gameCode}:${normalizedName}` → canonical_teams.id
  const gbTeamNameMap = new Map(); // gb_team_id → display name
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

  const idMap = new Map(); // `${platform}:${platformId}` → gb_team_id string
  const _savedIds = new Set();

  for (const row of allMaps) {
    if (!row.platform_id) continue;
    const key = `${row.platform}:${row.platform_id}`;
    _savedIds.add(key);
    if (!row.canonical_id) continue;
    idMap.set(key, String(row.canonical_id));
  }

  console.log(
    `[team-resolver] 加载完成 — ${allTeams.length} 支队伍 / ${nameMap.size} 个名称映射 / ${idMap.size} 个平台ID映射`
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
    return gbTeamNameMap.get(String(gbTeamId)) || null;
  }

  function saveMapping(gbTeamId, platform, platformId, platformName, gameCode) {
    const manualId = Number(gbTeamId);
    if (!platformId || !Number.isFinite(manualId) || manualId < 100000) return;
    const key = `${platform}:${platformId}`;
    if (_savedIds.has(key)) return;
    _savedIds.add(key);
    idMap.set(key, String(manualId));

    teamDb.saveTeamMappingFireAndForget({
      canonical_id: manualId,
      platform,
      platform_id: String(platformId),
      platform_name: String(platformName || ""),
      game: gameCode || null,
      source: "auto",
      confidence: 1.0,
    });
  }

  return { lookupByName, lookupById, lookupCanonicalName, saveMapping };
}

module.exports = { loadAndCreatePlugin };
