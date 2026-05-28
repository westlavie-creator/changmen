import type { CollectBetDto, CollectMatchDto } from "@/types/collect";

/** 对齐 A8 bundle `pp` — 按场次合并盘口，缺失盘口赔率清零 */
const betsByMatch = new Map<string, CollectBetDto[]>();

export function mergeStakeBets(matchId: string, incoming: CollectBetDto[]): CollectBetDto[] {
  if (!betsByMatch.has(matchId)) {
    betsByMatch.set(matchId, [...incoming]);
    return betsByMatch.get(matchId)!;
  }
  const prev = betsByMatch.get(matchId)!;
  for (const bet of incoming) {
    const idx = prev.findIndex((row) => row.SourceBetID === bet.SourceBetID);
    if (idx === -1) prev.push(bet);
    else prev[idx] = bet;
  }
  for (const row of prev) {
    if (!incoming.some((b) => b.SourceBetID === row.SourceBetID)) {
      row.HomeOdds = 0;
      row.AwayOdds = 0;
    }
  }
  return prev;
}

export function cleanStakeBets(activeMatches: CollectMatchDto[]) {
  const activeIds = new Set(activeMatches.map((m) => String(m.SourceMatchID)));
  for (const matchId of [...betsByMatch.keys()]) {
    if (!activeIds.has(matchId)) betsByMatch.delete(matchId);
  }
}

export function getMergedStakeBets(matchId: string): CollectBetDto[] {
  return betsByMatch.get(matchId) ?? [];
}
