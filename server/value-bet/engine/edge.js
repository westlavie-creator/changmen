/**
 * Edge 计算 — 对比软盘赔率 vs 公平赔率，得出 edge 和 Kelly 仓位。
 */

import { removVig } from "./fair_odds.js";
import {
  MIN_EDGE,
  MAX_EDGE,
  MIN_ODDS,
  MAX_ODDS,
  KELLY_MULTIPLIER,
  VIG_REMOVAL_METHOD,
} from "../lib/config.js";

/**
 * @typedef {Object} ValueSignal
 * @property {string} softPlatform
 * @property {"Home"|"Away"} side
 * @property {number} softOdds      软盘赔率
 * @property {number} fairOdds      去vig公平赔率
 * @property {number} edge          正EV边际 (0.03 = 3%)
 * @property {number} kellyFull     全Kelly仓位比例
 * @property {number} kellyFrac     缩放后Kelly仓位
 * @property {number} trueProb      真实获胜概率
 * @property {number} sharpHome     锐利盘主队赔率
 * @property {number} sharpAway     锐利盘客队赔率
 * @property {number} overround     锐利盘 overround
 */

/**
 * 扫描一个盘口（bet row）的所有软盘平台，返回正 EV 信号列表。
 *
 * @param {Object} sharpSource   PB 的 BetSourceDto { HomeOdds, AwayOdds, Status }
 * @param {Record<string, Object>} sources  所有平台的 Sources
 * @param {string[]} softPlatforms  要扫描的软盘平台列表
 * @returns {ValueSignal[]}
 */
export function scanBetForValue(sharpSource, sources, softPlatforms) {
  if (!sharpSource || sharpSource.Status === "Locked") return [];

  const fair = removVig(sharpSource.HomeOdds, sharpSource.AwayOdds, VIG_REMOVAL_METHOD);
  if (!fair) return [];

  const signals = [];

  for (const platform of softPlatforms) {
    const src = sources[platform];
    if (!src || src.Status === "Locked") continue;

    for (const side of /** @type {const} */ (["Home", "Away"])) {
      const softOdds = side === "Home" ? src.HomeOdds : src.AwayOdds;
      const fairOdds = side === "Home" ? fair.fairHome : fair.fairAway;
      const trueProb = side === "Home" ? fair.trueHomeProb : fair.trueAwayProb;

      if (!softOdds || softOdds <= 1) continue;
      if (softOdds < MIN_ODDS || softOdds > MAX_ODDS) continue;

      const edge = softOdds / fairOdds - 1;

      if (edge < MIN_EDGE || edge > MAX_EDGE) continue;

      const kellyFull = edge / (softOdds - 1);
      const kellyFrac = kellyFull * KELLY_MULTIPLIER;

      signals.push({
        softPlatform: platform,
        side,
        softOdds,
        fairOdds: round4(fairOdds),
        edge: round5(edge),
        kellyFull: round5(kellyFull),
        kellyFrac: round5(kellyFrac),
        trueProb: round5(trueProb),
        sharpHome: sharpSource.HomeOdds,
        sharpAway: sharpSource.AwayOdds,
        overround: round4(fair.overround),
      });
    }
  }

  return signals;
}

function round4(n) { return Math.round(n * 10000) / 10000; }
function round5(n) { return Math.round(n * 100000) / 100000; }
