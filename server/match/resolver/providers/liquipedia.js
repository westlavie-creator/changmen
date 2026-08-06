/**
 * Liquipedia provider（无需注册，使用 MediaWiki opensearch API）
 */

import axios from "axios";
import { normalize, similarity } from "../normalize.js";

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

export async function searchTeam(name, lpSlug) {
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

export function pickBestMatch(query, candidates) {
  const q = normalize(query);

  for (const c of candidates) {
    if (normalize(c.title) === q) {
      return { ...c, confidence: 1.0, matchType: "exact" };
    }
  }

  if (candidates.length > 0) {
    const first = candidates[0];
    const score = similarity(query, first.title);
    if (score > 0.3) {
      return { ...first, confidence: Math.max(score, 0.6), matchType: "opensearch_top" };
    }
  }
  return null;
}

export async function resolve(teamName, lpSlug) {
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
