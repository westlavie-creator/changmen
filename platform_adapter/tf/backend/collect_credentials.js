"use strict";

/**
 * TF 采集凭证 — 从本地 store / 环境变量读取，不再调用 A8 esport API。
 * 配置方式（按优先级）：
 *   1. platforms.json 中 TF 条目的 gateway / token
 *   2. 环境变量 TF_GATEWAY + TF_TOKEN
 */
function getTfA8CollectCredentials() {
  const store = require("./_require.js").reqB("core/esport-api/store.js");
  const platform = store.getPlatform("TF");

  if (platform?.gateway && platform?.token) {
    return {
      gateway: platform.gateway,
      token: platform.token,
      betName: platform.betName || "^获胜者$",
      games: platform.games || [],
      provider: "TF",
    };
  }

  const gateway = process.env.TF_GATEWAY;
  const token = process.env.TF_TOKEN;
  if (gateway && token) {
    return {
      gateway,
      token,
      betName: process.env.TF_BET_NAME || "^获胜者$",
      games: [],
      provider: "TF",
    };
  }

  throw new Error("TF 采集凭证未配置：请在 platforms.json 设置 TF 条目，或设置环境变量 TF_GATEWAY + TF_TOKEN");
}

function clearTfA8CollectCache() {
  /* 本地读取无缓存，保留函数签名兼容旧调用 */
}

module.exports = {
  getTfA8CollectCredentials,
  clearTfA8CollectCache,
};
