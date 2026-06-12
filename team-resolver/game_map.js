"use strict";

/**
 * 内部 gameCode → 各数据源 slug 映射
 * gameCode 与 changmen/packages/shared/catalog/game_catalog.json 对齐
 */
const GAME_MAP = {
  cs2: {
    pandascore: "cs-go",
    pandascoreEndpoint: "csgo",   // /csgo/teams
    liquipedia: "counterstrike",
    label: "CS2",
  },
  lol: {
    pandascore: "league-of-legends",
    pandascoreEndpoint: "lol",    // /lol/teams
    liquipedia: "leagueoflegends",
    label: "League of Legends",
  },
  dota2: {
    pandascore: "dota-2",
    pandascoreEndpoint: "dota2",  // /dota2/teams
    liquipedia: "dota2",
    label: "Dota 2",
  },
  valorant: {
    pandascore: "valorant",
    pandascoreEndpoint: "valorant", // /valorant/teams
    liquipedia: "valorant",
    label: "Valorant",
  },
  kog: {
    pandascore: null,
    pandascoreEndpoint: null,     // PandaScore 不收录王者荣耀
    liquipedia: "honorofkings",
    label: "Honor of Kings",
  },
};

function getPandascoreSlug(gameCode) {
  return GAME_MAP[gameCode]?.pandascore ?? null;
}

function getPandascoreEndpoint(gameCode) {
  return GAME_MAP[gameCode]?.pandascoreEndpoint ?? null;
}

function getLiquipediaSlug(gameCode) {
  return GAME_MAP[gameCode]?.liquipedia ?? null;
}

function getSupportedGameCodes() {
  return Object.keys(GAME_MAP);
}

module.exports = { GAME_MAP, getPandascoreSlug, getPandascoreEndpoint, getLiquipediaSlug, getSupportedGameCodes };
