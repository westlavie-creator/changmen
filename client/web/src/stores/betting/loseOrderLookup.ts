import type { ViewBet, ViewMatch } from "@/models/match";

export interface LoseOrderBetRef {
  match: ViewMatch;
  bet: ViewBet;
}

/** 每轮补单 tick 构建一次：betId → match + bet */
export function buildLoseOrderBetLookup(
  matches: ViewMatch[],
): Map<number, LoseOrderBetRef> {
  const lookup = new Map<number, LoseOrderBetRef>();
  for (const match of matches) {
    for (const bet of match.bets) {
      lookup.set(bet.id, { match, bet });
    }
  }
  return lookup;
}
