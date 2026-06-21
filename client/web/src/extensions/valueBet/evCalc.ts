/**
 * 纯计算函数 — 去vig + edge 计算（与 server/value-bet/engine/fair_odds.js 相同逻辑）。
 */

export interface FairOdds {
  fairHome: number;
  fairAway: number;
  overround: number;
}

export function removVig(homeOdds: number, awayOdds: number): FairOdds | null {
  if (!homeOdds || !awayOdds || homeOdds <= 1 || awayOdds <= 1)
    return null;
  const ih = 1 / homeOdds;
  const ia = 1 / awayOdds;
  const or = ih + ia;
  if (or <= 1)
    return null;
  return { fairHome: 1 / (ih / or), fairAway: 1 / (ia / or), overround: or };
}

export function calcEdge(softOdds: number, fairOdds: number): number {
  if (!softOdds || !fairOdds || softOdds <= 1 || fairOdds <= 1)
    return 0;
  return softOdds / fairOdds - 1;
}
