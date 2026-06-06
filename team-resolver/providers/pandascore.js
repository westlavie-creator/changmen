"use strict";

/**
 * PandaScore provider
 *
 * 免费账号：https://pandascore.co  注册后在 Dashboard → API tokens 获取 token。
 * 免费额度：1000 req/小时。
 *
 * 配置：环境变量 PANDASCORE_TOKEN 或调用 setToken()。
 */

const axios = require("axios");
const { normalize, similarity, isAcronymOf } = require("../normalize");
const { getPandascoreEndpoint } = require("../game_map");

const BASE_URL = "https://api.pandascore.co";
let _token = process.env.PANDASCORE_TOKEN || "";

function setToken(token) {
  _token = token;
}

function isConfigured() {
  return !!_token;
}

function _buildUrl(endpoint, params) {
  const parts = [`token=${encodeURIComponent(_token)}`];
  for (const [k, v] of Object.entries(params)) {
    parts.push(`${k}=${encodeURIComponent(v)}`);
  }
  return `${BASE_URL}/${endpoint}?${parts.join("&")}`;
}

function _mapTeam(t) {
  return { id: `pandascore:${t.id}`, name: t.name, acronym: t.acronym || "", slug: t.slug || "" };
}

async function _get(url) {
  try {
    const res = await axios.get(url, { timeout: 8000 });
    return res.data || [];
  } catch (err) {
    if (err.response?.status === 401) throw new Error("PANDASCORE_TOKEN 无效");
    if (err.response?.status === 429) throw new Error("PandaScore 请求频率超限");
    throw err;
  }
}

/**
 * 搜索队伍：先尝试 acronym 精确过滤，再 fallback name 搜索。
 * 使用游戏专属端点（/lol/teams、/csgo/teams 等）自动限定游戏范围。
 *
 * @param {string} name      - 原始队名（"EDG"、"Natus Vincere"）
 * @param {string} gameCode  - 内部 gameCode（cs2 | lol | dota2 | valorant | kog）
 * @returns {Promise<Array>} - 候选列表 [{ id, name, acronym, slug }]
 */
async function searchTeam(name, gameCode) {
  if (!_token) throw new Error("PANDASCORE_TOKEN 未配置");
  const ep = getPandascoreEndpoint(gameCode);
  if (!ep) return [];

  const teamsPath = `${ep}/teams`;

  // 1. acronym 精确过滤（适用于 "EDG"、"NAVI"、"G2" 等缩写）
  const acronymUrl = _buildUrl(teamsPath, { "filter[acronym]": name.toUpperCase(), per_page: 5 });
  const byAcronym = (await _get(acronymUrl)).map(_mapTeam);
  if (byAcronym.length) return byAcronym;

  // 2. name 全文搜索（适用于 "Edward Gaming"、"Natus Vincere" 等全称）
  const nameUrl = _buildUrl(teamsPath, { "search[name]": name, per_page: 10 });
  return (await _get(nameUrl)).map(_mapTeam);
}

/**
 * 从候选列表中选出最匹配的队伍。
 * 匹配优先级：
 *   1. acronym 完全匹配（大小写不敏感）
 *   2. name 规范化后完全匹配
 *   3. 缩写检测（isAcronymOf）
 *   4. token overlap 相似度 > 0.5
 */
function pickBestMatch(query, candidates) {
  const q = normalize(query);
  const qUpper = query.trim().toUpperCase();

  for (const c of candidates) {
    if (c.acronym && c.acronym.toUpperCase() === qUpper) {
      return { ...c, confidence: 1.0, matchType: "acronym" };
    }
  }

  for (const c of candidates) {
    if (normalize(c.name) === q) {
      return { ...c, confidence: 1.0, matchType: "exact" };
    }
  }

  for (const c of candidates) {
    if (isAcronymOf(query, c.name)) {
      return { ...c, confidence: 0.85, matchType: "acronym_inferred" };
    }
  }

  let best = null;
  let bestScore = 0;
  for (const c of candidates) {
    const score = similarity(query, c.name);
    if (score > bestScore) { bestScore = score; best = c; }
    if (c.acronym) {
      const aScore = similarity(query, c.acronym);
      if (aScore > bestScore) { bestScore = aScore; best = c; }
    }
  }
  if (best && bestScore > 0.5) {
    return { ...best, confidence: bestScore, matchType: "fuzzy" };
  }

  return null;
}

/**
 * 解析队伍名称 → 规范信息。
 * @param {string} teamName
 * @param {string} gameCode  - 内部 gameCode
 * @returns {Promise<{id, name, acronym, confidence, matchType, source}|null>}
 */
async function resolve(teamName, gameCode) {
  const candidates = await searchTeam(teamName, gameCode);
  if (!candidates.length) return null;
  const match = pickBestMatch(teamName, candidates);
  if (!match) return null;
  return { ...match, source: "pandascore" };
}

module.exports = { resolve, searchTeam, pickBestMatch, setToken, isConfigured };
