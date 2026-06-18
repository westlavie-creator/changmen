/** kakaxi 调度队列中的一条待执行盘口 */
export interface KakaxiQueuedBet {
  matchId: number;
  betId: number;
  enqueuedAt: number;
  implied: number;
  isLive: boolean;
}

export function kakaxiBetKey(matchId: number, betId: number): string {
  return `${matchId}:${betId}`;
}
