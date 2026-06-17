/**
 * PandaScore provider
 *
 * 配置：环境变量 PANDASCORE_TOKEN 或调用 setToken()。
 */

import axios from "axios";
import { normalize, similarity, isAcronymOf } from "../normalize.js";
import { getPandascoreEndpoint } from "../game_map.js";

const BASE_URL = "https://api.pandascore.co";
let _token = process.env.PANDASCORE_TOKEN || "";
const ENABLE_ACRONYM_MATCHING = false;

export function setToken(token) {
  _token = token;
}

export function isConfigured() {
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

export async function searchTeam(name, gameCode) {
  if (!_token) throw new Error("PANDASCORE_TOKEN 未配置");
  const ep = getPandascoreEndpoint(gameCode);
  if (!ep) return [];

  const teamsPath = `${ep}/teams`;

  if (ENABLE_ACRONYM_MATCHING) {
    const acronymUrl = _buildUrl(teamsPath, { "filter[acronym]": name.toUpperCase(), per_page: 5 });
    const byAcronym = (await _get(acronymUrl)).map(_mapTeam);
    if (byAcronym.length) return byAcronym;
  }

  const nameUrl = _buildUrl(teamsPath, { "search[name]": name, per_page: 10 });
  return (await _get(nameUrl)).map(_mapTeam);
}

export function pickBestMatch(query, candidates) {
  const q = normalize(query);
  const qUpper = query.trim().toUpperCase();

  for (const c of candidates) {
    if (ENABLE_ACRONYM_MATCHING && c.acronym && c.acronym.toUpperCase() === qUpper) {
      return { ...c, confidence: 1.0, matchType: "acronym" };
    }
  }

  for (const c of candidates) {
    if (normalize(c.name) === q) {
      return { ...c, confidence: 1.0, matchType: "exact" };
    }
  }

  for (const c of candidates) {
    if (ENABLE_ACRONYM_MATCHING && isAcronymOf(query, c.name)) {
      return { ...c, confidence: 0.85, matchType: "acronym_inferred" };
    }
  }

  let best = null;
  let bestScore = 0;
  for (const c of candidates) {
    const score = similarity(query, c.name);
    if (score > bestScore) { bestScore = score; best = c; }
    if (ENABLE_ACRONYM_MATCHING && c.acronym) {
      const aScore = similarity(query, c.acronym);
      if (aScore > bestScore) { bestScore = aScore; best = c; }
    }
  }
  if (best && bestScore > 0.5) {
    return { ...best, confidence: bestScore, matchType: "fuzzy" };
  }

  return null;
}

export async function resolve(teamName, gameCode) {
  const candidates = await searchTeam(teamName, gameCode);
  if (!candidates.length) return null;
  const match = pickBestMatch(teamName, candidates);
  if (!match) return null;
  return { ...match, source: "pandascore" };
}
