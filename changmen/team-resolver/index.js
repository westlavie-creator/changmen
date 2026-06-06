"use strict";

/**
 * team-resolver — 主入口
 *
 * 用法：
 *   const resolver = require('./index');
 *   const result = await resolver.resolve('EDG', 'lol');
 *   // → { id: 'pandascore:131583', name: 'Edward Gaming', confidence: 1.0, source: 'pandascore' }
 *
 * 解析顺序：
 *   1. 本地缓存（cache/teams.json，TTL 7天）
 *   2. PandaScore（需 PANDASCORE_TOKEN 环境变量）
 *   3. Liquipedia（无需 token，有限速 2s/req）
 */

const cache = require("./cache");
const pandascore = require("./providers/pandascore");
const liquipedia = require("./providers/liquipedia");
const { normalize } = require("./normalize");
const { getLiquipediaSlug } = require("./game_map");

/**
 * 解析队伍名称。
 *
 * @param {string} teamName   - 任意形式的队名（缩写/全称/中文）
 * @param {string} gameCode   - 内部游戏代码：cs2 | lol | dota2 | valorant | kog
 * @param {object} [opts]
 * @param {boolean} [opts.forceRefresh]  - 忽略缓存强制重查
 * @param {boolean} [opts.pandascoreOnly] - 只用 PandaScore，不 fallback Liquipedia
 *
 * @returns {Promise<{
 *   id: string,
 *   name: string,
 *   confidence: number,
 *   matchType: string,
 *   source: 'pandascore'|'liquipedia'|'cache',
 * }|null>}
 */
async function resolve(teamName, gameCode, opts = {}) {
  const normalizedName = normalize(teamName);
  if (!normalizedName) return null;

  // 1. 缓存
  if (!opts.forceRefresh) {
    const cached = cache.get(normalizedName, gameCode);
    if (cached) return { ...cached, source: "cache" };
  }

  const lpSlug = getLiquipediaSlug(gameCode);

  let result = null;

  // 2. PandaScore（直接传 gameCode，内部用游戏专属端点）
  if (pandascore.isConfigured()) {
    try {
      result = await pandascore.resolve(teamName, gameCode);
    } catch (err) {
      console.warn(`[pandascore] ${teamName}/${gameCode} 查询失败:`, err.message);
    }
  }

  // 3. Liquipedia fallback
  if (!result && !opts.pandascoreOnly && lpSlug) {
    try {
      result = await liquipedia.resolve(teamName, lpSlug);
    } catch (err) {
      console.warn(`[liquipedia] ${teamName}/${gameCode} 查询失败:`, err.message);
    }
  }

  if (result) {
    cache.set(normalizedName, gameCode, result);
  }

  return result;
}

/**
 * 批量解析一场比赛的双方队伍。
 * 返回 { home, away }，每项为 resolve() 的结果或 null。
 */
async function resolveMatch(homeTeam, awayTeam, gameCode, opts = {}) {
  const [home, away] = await Promise.all([
    resolve(homeTeam, gameCode, opts),
    resolve(awayTeam, gameCode, opts),
  ]);
  return { home, away };
}

/**
 * 计算两个平台对同一场比赛的匹配置信度。
 * 用于判断是否应该将两行合并。
 *
 * @param {object} matchA  - { home, away, gameCode, startTimeMs }
 * @param {object} matchB
 * @returns {Promise<{ shouldMerge: boolean, confidence: number, reason: string }>}
 */
async function scoreMatchPair(matchA, matchB) {
  if (matchA.gameCode !== matchB.gameCode) {
    return { shouldMerge: false, confidence: 0, reason: "game_mismatch" };
  }

  const timeDiffMs = Math.abs((matchA.startTimeMs || 0) - (matchB.startTimeMs || 0));
  if (timeDiffMs > 30 * 60 * 1000) {
    return { shouldMerge: false, confidence: 0, reason: "time_too_far" };
  }

  const [resHomeA, resHomeB, resAwayA, resAwayB] = await Promise.all([
    resolve(matchA.home, matchA.gameCode),
    resolve(matchB.home, matchB.gameCode),
    resolve(matchA.away, matchA.gameCode),
    resolve(matchB.away, matchB.gameCode),
  ]);

  const homeMatch =
    resHomeA && resHomeB && resHomeA.id === resHomeB.id
      ? { same: true, score: Math.min(resHomeA.confidence, resHomeB.confidence) }
      : { same: false, score: 0 };

  const awayMatch =
    resAwayA && resAwayB && resAwayA.id === resAwayB.id
      ? { same: true, score: Math.min(resAwayA.confidence, resAwayB.confidence) }
      : { same: false, score: 0 };

  // 正向匹配
  if (homeMatch.same && awayMatch.same) {
    const confidence = (homeMatch.score + awayMatch.score) / 2;
    return { shouldMerge: true, confidence, reason: "both_teams_matched" };
  }

  // 交叉匹配（home/away 顺序反了）
  const [crossHomeA, crossAwayB] = [resHomeA, resAwayB];
  const [crossAwayA, crossHomeB] = [resAwayA, resHomeB];
  const crossHome = crossHomeA && crossHomeB && crossHomeA.id === crossHomeB.id;
  const crossAway = crossAwayA && crossAwayB && crossAwayA.id === crossAwayB.id;
  if (crossHome && crossAway) {
    const confidence =
      (Math.min(crossHomeA.confidence, crossHomeB.confidence) +
        Math.min(crossAwayA.confidence, crossAwayB.confidence)) /
      2;
    return { shouldMerge: true, confidence, reason: "both_teams_matched_reversed", reversed: true };
  }

  return { shouldMerge: false, confidence: 0, reason: "teams_not_resolved" };
}

module.exports = { resolve, resolveMatch, scoreMatchPair };
