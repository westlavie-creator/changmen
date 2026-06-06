"use strict";

/**
 * 队伍名称归一化 + 跨平台 canonical key 计算。
 * team-resolver 插件通过 setTeamPlugin() 注入，不注入时行为与原来完全一致。
 */

const { isPlaceholderTeamName, stableId } = require("./match_utils");

// ── team-resolver 插件桥 ──────────────────────────────────────────────────────

let _teamPlugin = null;

function setTeamPlugin(plugin) { _teamPlugin = plugin; }

function _lookupByName(gameCode, normalizedName) {
  if (!_teamPlugin) return null;
  if (typeof _teamPlugin === "function") return _teamPlugin(gameCode, normalizedName);
  return _teamPlugin.lookupByName?.(gameCode, normalizedName) || null;
}

function _lookupById(platform, platformId) {
  if (!_teamPlugin || typeof _teamPlugin === "function") return null;
  return _teamPlugin.lookupById?.(platform, platformId) || null;
}

function _saveMapping(canonId, platform, platformId, platformName) {
  if (!_teamPlugin || typeof _teamPlugin === "function") return;
  _teamPlugin.saveMapping?.(canonId, platform, platformId, platformName);
}

// ── 队名归一化 ────────────────────────────────────────────────────────────────

let _aliases = null;
function getAliases() {
  if (!_aliases) {
    try {
      const raw = require("./team_aliases.json");
      _aliases = Object.fromEntries(Object.entries(raw).filter(([k]) => !k.startsWith("_")));
    } catch {
      _aliases = {};
    }
  }
  return _aliases;
}

/**
 * 小写 → 去标点 → 去末尾通用后缀（esports/gaming）→ 别名替换。
 * 保留 CJK 字符，支持 team_aliases.json 扩展。
 */
function normalizeTeam(name) {
  const base = String(name || "")
    .toLowerCase()
    .replace(/[·\-—_·•\s]+/g, " ")
    .replace(/[^\w\s一-鿿]/g, "")
    .trim()
    .replace(/\s+(?:esports?|gaming)$/, "")
    .trim();
  return getAliases()[base] || base;
}

// ── canonical key ─────────────────────────────────────────────────────────────

/**
 * 计算赛事的规范化 key。
 * 两队名按字母序排列，保证不同平台同场赛事产生相同 key。
 * 返回 { key: number, reversed: boolean } 或 null（占位队名时）。
 *
 * ctx（可选）：{ provider, homeId, awayId }
 *   有 team-resolver 插件时：先查 platform_id，再 fallback 名称查找，
 *   解析成功后异步写入 team_platform_maps（自动学习）。
 */
function canonicalMatchKey(gameId, home, away, gameCode, ctx) {
  const nh = normalizeTeam(home);
  const na = normalizeTeam(away);
  if (!nh || !na) return null;
  if (isPlaceholderTeamName(nh) || isPlaceholderTeamName(na)) return null;

  let hk = nh;
  let ak = na;

  if (_teamPlugin && gameCode) {
    const provider = ctx?.provider;
    const homeCanonId =
      (provider && _lookupById(provider, ctx?.homeId)) ||
      _lookupByName(gameCode, nh);
    const awayCanonId =
      (provider && _lookupById(provider, ctx?.awayId)) ||
      _lookupByName(gameCode, na);

    // 必须两队都解析成功才用 canonical_id 作为 key。
    // 只有一队解析成功时混用会导致不同平台生成不同 key（一侧用 id、另一侧用字符串）。
    if (homeCanonId && awayCanonId) {
      hk = homeCanonId;
      ak = awayCanonId;
    }

    if (provider) {
      if (homeCanonId && ctx?.homeId) _saveMapping(homeCanonId, provider, ctx.homeId, home, gameCode);
      if (awayCanonId && ctx?.awayId) _saveMapping(awayCanonId, provider, ctx.awayId, away, gameCode);
    }
  }

  const reversed = hk > ak;
  const [first, second] = reversed ? [ak, hk] : [hk, ak];
  return {
    key: stableId(`match:${String(gameId || "")}:${first}:${second}`),
    reversed,
  };
}

module.exports = { normalizeTeam, canonicalMatchKey, setTeamPlugin };
