import type { ViewBet, ViewMatch } from "@/models/match";
import type { LoseOrder } from "@/models/loseOrder";
import type { ActiveBetRun } from "@/types/activeBetRun";
import { loadLinkBetContext } from "@/stores/betting/linkBetContext";

export interface ResolveMatchBetHint {
  linkId?: number;
  loseOrders?: Iterable<LoseOrder>;
  activeRuns?: Iterable<ActiveBetRun>;
}

function resolveByIds(
  matches: ViewMatch[],
  matchId: number,
  betId: number,
): { match: ViewMatch; bet: ViewBet } | undefined {
  if (!matchId || !betId)
    return undefined;
  const match = matches.find(m => m.id === matchId);
  if (!match)
    return undefined;
  const bet = match.bets.find(b => b.id === betId);
  if (!bet)
    return undefined;
  return { match, bet };
}

/** 侧栏 Link 表头双击：用 link 绑定的 matchId/betId 取对象（对齐 BetRow 标题双击） */
export function resolveMatchBetForLink(
  matches: ViewMatch[],
  linkId: number,
  hint?: Omit<ResolveMatchBetHint, "linkId">,
): { match: ViewMatch; bet: ViewBet } | undefined {
  const link = Number(linkId) || 0;
  if (!link)
    return undefined;

  const saved = loadLinkBetContext(link);
  if (saved) {
    const resolved = resolveByIds(matches, saved.matchId, saved.betId);
    if (resolved)
      return resolved;
  }

  for (const order of hint?.loseOrders ?? []) {
    if (Number(order.linkId) !== link)
      continue;
    const resolved = resolveByIds(matches, order.matchId, order.betId);
    if (resolved)
      return resolved;
  }

  for (const run of hint?.activeRuns ?? []) {
    if (Number(run.linkId) !== link)
      continue;
    const resolved = resolveByIds(matches, run.matchId, run.betId);
    if (resolved)
      return resolved;
  }

  return undefined;
}
