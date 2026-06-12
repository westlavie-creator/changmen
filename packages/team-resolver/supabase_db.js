"use strict";

/**
 * 从 Supabase 加载队伍映射，构建同步查找插件。
 *
 * 插件对象接口：
 *   lookupByName(gameCode, normalizedName) → canonical_teams.id string | null（内部合并用）
 *   lookupById(platform, platformId)       → gb_team_id string | null（仅手动映射）
 *   saveMapping(gbTeamId, ...)            → 仅当 gbTeamId 为手动 ID 时写 maps
 */

const path = require("path");
require("dotenv").config({ path: path.join(__dirname, "../../gamebet_backend/.env") });

const { createClient } = require("@supabase/supabase-js");

const SUPABASE_URL = process.env.SUPABASE_URL || "";
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY || "";
const ENABLE_ACRONYM_NAME_LOOKUP = false; // 临时禁用 acronym 自动匹配，避免 DK 等短缩写误命中。

let _sb = null;
function getSupabase() {
  if (!_sb) _sb = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
  return _sb;
}

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

async function _loadAll(table, select) {
  const sb = getSupabase();
  const PAGE = 1000;
  const result = [];
  for (let off = 0; ; off += PAGE) {
    const { data, error } = await sb.from(table).select(select).range(off, off + PAGE - 1);
    if (error) throw error;
    result.push(...(data || []));
    if ((data || []).length < PAGE) break;
  }
  return result;
}

async function loadAndCreatePlugin() {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
    throw new Error("SUPABASE_URL 或 SUPABASE_SERVICE_KEY 未配置");
  }

  // ── 名称查找 Map：从 canonical_teams 构建 ──────────────────────────────────
  const allTeams = await _loadAll("canonical_teams", "id, gb_team_id, game, name, acronym");

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
    if (ENABLE_ACRONYM_NAME_LOOKUP && team.acronym) {
      const acronymKey = _norm(team.acronym);
      if (acronymKey && acronymKey !== nameKey) nameMap.set(`${g}:${acronymKey}`, id);
    }
  }

  // ── ID 查找 Map：从 team_platform_maps 构建 ───────────────────────────────
  const allMaps = await _loadAll(
    "team_platform_maps",
    "canonical_id, platform, platform_id"
  );

  const idMap = new Map(); // `${platform}:${platformId}` → gb_team_id string
  const _savedIds = new Set(); // 防止重复写库的内存去重

  for (const row of allMaps) {
    if (!row.platform_id) continue;
    const key = `${row.platform}:${row.platform_id}`;
    _savedIds.add(key); // 无论是否有 canonical_id，都标记为已存在，避免重复写
    if (!row.canonical_id) continue; // canonical_id 为 NULL 的行不加入查找索引
    idMap.set(key, String(row.canonical_id));
  }

  console.log(
    `[team-resolver] 加载完成 — ${allTeams.length} 支队伍 / ${nameMap.size} 个名称映射 / ${idMap.size} 个平台ID映射`
  );

  // ── 插件对象 ──────────────────────────────────────────────────────────────

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
    if (_savedIds.has(key)) return; // 已保存过，跳过
    _savedIds.add(key);
    idMap.set(key, String(manualId)); // 同步更新内存

    // 异步写库，不阻塞主流程
    getSupabase()
      .from("team_platform_maps")
      .upsert(
        {
          canonical_id: manualId,
          platform,
          platform_id: String(platformId),
          platform_name: String(platformName || ""),
          game: gameCode || null,
          source: "auto",
          confidence: 1.0,
        },
        { onConflict: "platform,platform_id" }
      )
      .then(({ error }) => {
        if (error) console.warn("[team-resolver] saveMapping 失败:", error.message);
      });
  }

  return { lookupByName, lookupById, lookupCanonicalName, saveMapping };
}

module.exports = { loadAndCreatePlugin };
