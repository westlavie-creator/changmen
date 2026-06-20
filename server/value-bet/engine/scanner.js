/**
 * Value-bet 扫描器 — 从 client_matches 读取多平台赔率，输出正 EV 信号。
 */

import { fetchClientMatches } from "@changmen/db";
import { scanBetForValue } from "./edge.js";
import { SHARP_PLATFORM, SOFT_PLATFORMS } from "../lib/config.js";

/**
 * @typedef {Object} MatchSignal
 * @property {number}  matchId
 * @property {string}  title
 * @property {string}  game
 * @property {number}  startTime
 * @property {string}  betName
 * @property {number}  map
 * @property {string}  homeName
 * @property {string}  awayName
 * @property {import("./edge.js").ValueSignal} signal
 */

/**
 * 执行一轮全量扫描，返回所有正 EV 信号。
 * @returns {Promise<MatchSignal[]>}
 */
export async function scanOnce() {
  const matches = await fetchClientMatches();
  if (!matches || matches.length === 0) return [];

  const allSignals = [];

  for (const match of matches) {
    const bets = match.bets;
    if (!bets) continue;

    const betRows = Array.isArray(bets) ? bets : bets.Bets || bets.bets || [];

    for (const bet of betRows) {
      const sources = bet.Sources || bet.sources;
      if (!sources) continue;

      const sharp = sources[SHARP_PLATFORM];
      if (!sharp) continue;

      const signals = scanBetForValue(sharp, sources, SOFT_PLATFORMS);

      for (const sig of signals) {
        allSignals.push({
          matchId: match.id,
          title: match.title || "",
          game: match.game || "",
          startTime: match.start_time || 0,
          betName: bet.Name || bet.name || "",
          map: bet.Map ?? bet.map ?? 0,
          homeName: bet.HomeName || bet.homeName || "",
          awayName: bet.AwayName || bet.awayName || "",
          signal: sig,
        });
      }
    }
  }

  allSignals.sort((a, b) => b.signal.edge - a.signal.edge);

  return allSignals;
}
