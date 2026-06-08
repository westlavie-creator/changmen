"use strict";

/**
 * A8 bundle wQe / CQe：IA 采集默认对象（gateway 写死，token 为空字符串）。
 * 与 changmen/gamebet_frontend/console/index.js AccountInfo 无关。
 */
const IA_A8_COLLECT = {
  gateway: "https://ilustre-analytics.org",
  token: "",
  betName: "([全场].+获胜$)|([地图\\d].+获胜者$)",
  games: ["1", "2", "3", "16", "43"],
};

function getIaA8CollectCredentials() {
  return {
    gateway: IA_A8_COLLECT.gateway,
    token: IA_A8_COLLECT.token,
    betName: IA_A8_COLLECT.betName,
    games: [...IA_A8_COLLECT.games],
    provider: "IA",
  };
}

module.exports = {
  IA_A8_COLLECT,
  getIaA8CollectCredentials,
};
