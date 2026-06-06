"use strict";

/**
 * 从 Supabase 加载队伍映射，构建同步查找插件。
 *
 * 插件对象接口：
 *   lookupByName(gameCode, normalizedName) → canonical_id string | null
 *   lookupById(platform, platformId)       → canonical_id string | null
 *   saveMapping(canonId, platform, platformId, platformName) → void (fire-and-forget)
 */

const path = require("path");
require("dotenv").config({ path: path.join(__dirname, "../gamebet_backend/.env") });

const { createClient } = require("@supabase/supabase-js");

const SUPABASE_URL = process.env.SUPABASE_URL || "";
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY || "";

let _sb = null;
function getSupabase() {
  if (!_sb) _sb = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
  return _sb;
}

function _norm(name) {
  return String(name || "")
    .toLowerCase()
    .replace(/[·\-—_·•\s]+/g, " ")
    .replace(/[^\w\s一-鿿]/g, "")
    .trim()
    .replace(/\s+(?:esports?|gaming)$/i, "")
    .trim();
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
  const allTeams = await _loadAll("canonical_teams", "id, game, name, acronym");

  const nameMap = new Map(); // `${gameCode}:${normalizedName}` → canonical_id string
  for (const team of allTeams) {
    const id = String(team.id);
    const g = team.game;
    const nameKey = _norm(team.name);
    if (nameKey) nameMap.set(`${g}:${nameKey}`, id);
    if (team.acronym) {
      const acronymKey = _norm(team.acronym);
      if (acronymKey && acronymKey !== nameKey) nameMap.set(`${g}:${acronymKey}`, id);
    }
  }

  // ── ID 查找 Map：从 team_platform_maps 构建 ───────────────────────────────
  const allMaps = await _loadAll(
    "team_platform_maps",
    "canonical_id, platform, platform_id"
  );

  const idMap = new Map(); // `${platform}:${platformId}` → canonical_id string
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

  function saveMapping(canonId, platform, platformId, platformName, gameCode) {
    if (!platformId || !canonId) return;
    const key = `${platform}:${platformId}`;
    if (_savedIds.has(key)) return; // 已保存过，跳过
    _savedIds.add(key);
    idMap.set(key, String(canonId)); // 同步更新内存

    // 异步写库，不阻塞主流程
    getSupabase()
      .from("team_platform_maps")
      .upsert(
        {
          canonical_id: Number(canonId),
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

  return { lookupByName, lookupById, saveMapping };
}

module.exports = { loadAndCreatePlugin };
