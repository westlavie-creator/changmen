"use strict";

const { fetchCollectPlatformWithGames } = require("./a8_esport_client.js");

let cached = null;
let cachedAt = 0;
const CACHE_MS = Number(process.env.TF_A8_COLLECT_CACHE_MS || 60_000);

/**
 * 从 A8 服务器 Client_GetCollectPlatform + Client_GetGames 获取 TF 采集凭证。
 * 账号默认 TJ01 / a123456（shared/a8_constants.js）。
 */
async function getTfA8CollectCredentials(force = false) {
  const now = Date.now();
  if (!force && cached && now - cachedAt < CACHE_MS) {
    return { ...cached, games: [...cached.games] };
  }
  const row = await fetchCollectPlatformWithGames("TF");
  if (!row.gateway || !row.token) {
    throw new Error("A8 Client_GetCollectPlatform(TF) 未返回 Gateway/Token");
  }
  cached = {
    gateway: row.gateway,
    token: row.token,
    betName: row.betName || "^获胜者$",
    games: row.games || [],
    provider: "TF",
  };
  cachedAt = now;
  return { ...cached, games: [...cached.games] };
}

function clearTfA8CollectCache() {
  cached = null;
  cachedAt = 0;
}

module.exports = {
  getTfA8CollectCredentials,
  clearTfA8CollectCache,
};
