import teamAliasesJson from "./team_aliases.json" with { type: "json" };
import { isPlaceholderTeamName, stableId } from "./match_utils.js";

/**
 * 队伍名称归一化 + 跨平台 canonical key 计算。
 * team-resolver 插件通过 setTeamPlugin() 注入，不注入时行为与原来完全一致。
 */

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

function lookupGbTeamIdByPlatform(platform, platformId) {
  return _lookupById(platform, platformId);
}

function lookupCanonicalTeamName(gbTeamId) {
  if (!_teamPlugin || typeof _teamPlugin === "function") return null;
  return _teamPlugin.lookupCanonicalName?.(String(gbTeamId)) || null;
}

// ── 队名归一化 ────────────────────────────────────────────────────────────────

const _aliases = Object.fromEntries(
  Object.entries(teamAliasesJson).filter(([k]) => !k.startsWith("_")),
);
function getAliases() {
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
 * 计算赛事的规范化 key（兼容旧逻辑：ID / canonical 队名 / 归一化队名混合）。
 * 新合并流程请用 canonicalMatchKeyByIdOnly + canonicalMatchKeyByName 两阶段。
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

    if (homeCanonId && awayCanonId) {
      hk = homeCanonId;
      ak = awayCanonId;
    }

    if (provider) {
      if (homeCanonId && ctx?.homeId) _saveMapping(homeCanonId, provider, ctx.homeId, home, gameCode);
      if (awayCanonId && ctx?.awayId) _saveMapping(awayCanonId, provider, ctx.awayId, away, gameCode);
    }
  }

  return _packMatchKey(gameId, hk, ak, "legacy");
}

/** 第一阶段：仅 platform_id → canonical_id，主客两队都必须映射成功 */
function canonicalMatchKeyByIdOnly(gameId, home, away, gameCode, ctx) {
  const nh = normalizeTeam(home);
  const na = normalizeTeam(away);
  if (!nh || !na) return null;
  if (isPlaceholderTeamName(nh) || isPlaceholderTeamName(na)) return null;
  if (!_teamPlugin || !gameCode || !ctx?.provider) return null;

  const homeId = String(ctx.homeId || "").trim();
  const awayId = String(ctx.awayId || "").trim();
  if (!homeId || !awayId) return null;

  const homeCanonId = _lookupById(ctx.provider, homeId);
  const awayCanonId = _lookupById(ctx.provider, awayId);
  if (!homeCanonId || !awayCanonId) return null;

  return _packMatchKey(gameId, homeCanonId, awayCanonId, "id");
}

/** 第二阶段：仅队名归一化（不做 ID / canonical 队名查找） */
function canonicalMatchKeyByName(gameId, home, away) {
  const nh = normalizeTeam(home);
  const na = normalizeTeam(away);
  if (!nh || !na) return null;
  if (isPlaceholderTeamName(nh) || isPlaceholderTeamName(na)) return null;
  return _packMatchKey(gameId, nh, na, "name");
}

function _packMatchKey(gameId, hk, ak, kind) {
  const reversed = hk > ak;
  const [first, second] = reversed ? [ak, hk] : [hk, ak];
  const prefix = kind === "id" ? "match:id:" : kind === "name" ? "match:name:" : "match:";
  const mergeKey = `${prefix}${String(gameId || "")}:${first}:${second}`;
  return {
    mergeKey,
    key: mergeKey,
    reversed,
    basis: kind === "id" ? "id" : kind === "name" ? "name" : "legacy",
  };
}

/** 判定跨平台合并键是否由平台队伍 ID（team_platform_maps）解析成功 */
function classifyMergeBasis(home, away, gameCode, ctx) {
  const nh = normalizeTeam(home);
  const na = normalizeTeam(away);
  if (!nh || !na) return "unknown";

  if (_teamPlugin && gameCode && ctx?.provider) {
    const homeId = String(ctx.homeId || "").trim();
    const awayId = String(ctx.awayId || "").trim();
    if (homeId && awayId) {
      const hi = _lookupById(ctx.provider, homeId);
      const ai = _lookupById(ctx.provider, awayId);
      if (hi && ai) return "id";
    }
  }
  return "name";
}

export {
  normalizeTeam,
  canonicalMatchKey,
  canonicalMatchKeyByIdOnly,
  canonicalMatchKeyByName,
  classifyMergeBasis,
  setTeamPlugin,
  lookupGbTeamIdByPlatform,
  lookupCanonicalTeamName,
};
