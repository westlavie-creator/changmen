"use strict";

/**
 * Liquipedia provider（无需注册，使用 MediaWiki opensearch API）
 *
 * 限速：请求间隔 >= 2s（Liquipedia 规定）。
 * 覆盖：王者荣耀等 PandaScore 没有的游戏。
 *
 * 注意：opensearch 返回的是 wiki 页面标题，不是结构化的队伍 ID。
 * 我们用页面标题 slug 作为 canonicalId。
 */

const axios = require("axios");
const { normalize, similarity } = require("../normalize");

const BASE_URL = "https://liquipedia.net";
let _lastRequestAt = 0;
const MIN_INTERVAL_MS = 2100;

async function _throttle() {
  const gap = Date.now() - _lastRequestAt;
  if (gap < MIN_INTERVAL_MS) {
    await new Promise((r) => setTimeout(r, MIN_INTERVAL_MS - gap));
  }
  _lastRequestAt = Date.now();
}

/**
 * 用 opensearch 搜索 Liquipedia 页面标题。
 * @param {string} name
 * @param {string} lpSlug  - liquipedia game slug（如 "counterstrike"、"leagueoflegends"）
 * @returns {Promise<Array<{title, url}>>}
 */
async function searchTeam(name, lpSlug) {
  await _throttle();
  const url = `${BASE_URL}/${lpSlug}/api.php`;
  const params = {
    action: "opensearch",
    search: name,
    limit: 5,
    format: "json",
    origin: "*",
  };
  try {
    const res = await axios.get(url, {
      params,
      timeout: 8000,
      headers: {
        "User-Agent": "gamebet-team-resolver/1.0 (research; contact via github)",
        "Accept-Encoding": "gzip",
      },
    });
    const [, titles, , urls] = res.data;
    return (titles || []).map((title, i) => ({
      title,
      url: urls?.[i] || "",
      slug: title.replace(/\s+/g, "_"),
    }));
  } catch (err) {
    if (err.response?.status === 429) throw new Error("Liquipedia 请求频率超限");
    throw err;
  }
}

function pickBestMatch(query, candidates) {
  const q = normalize(query);

  // 完全匹配
  for (const c of candidates) {
    if (normalize(c.title) === q) {
      return { ...c, confidence: 1.0, matchType: "exact" };
    }
  }

  // 首个结果通常就是最相关的（opensearch 按相关度排序）
  if (candidates.length > 0) {
    const first = candidates[0];
    const score = similarity(query, first.title);
    if (score > 0.3) {
      return { ...first, confidence: Math.max(score, 0.6), matchType: "opensearch_top" };
    }
  }
  return null;
}

/**
 * @returns {Promise<{id, name, confidence, matchType, source}|null>}
 */
async function resolve(teamName, lpSlug) {
  if (!lpSlug) return null;
  const candidates = await searchTeam(teamName, lpSlug);
  if (!candidates.length) return null;
  const match = pickBestMatch(teamName, candidates);
  if (!match) return null;
  return {
    id: `liquipedia:${lpSlug}:${match.slug}`,
    name: match.title,
    confidence: match.confidence,
    matchType: match.matchType,
    source: "liquipedia",
  };
}

module.exports = { resolve, searchTeam, pickBestMatch };
