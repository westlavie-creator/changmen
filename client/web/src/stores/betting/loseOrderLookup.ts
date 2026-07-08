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

/** 优先 lookup；matchId 不一致时按 order.matchId 回退（避免 betId 碰撞） */
export function resolveLoseOrderBetRef(
  order: { betId: number; matchId: number },
  matches: ViewMatch[],
  lookup: Map<number, LoseOrderBetRef>,
): LoseOrderBetRef | undefined {
  const hit = lookup.get(order.betId);
  if (hit && hit.match.id === order.matchId)
    return hit;
  const match = matches.find(m => m.id === order.matchId);
  const bet = match?.bets.find(b => b.id === order.betId);
  if (match && bet)
    return { match, bet };
  return hit;
}
