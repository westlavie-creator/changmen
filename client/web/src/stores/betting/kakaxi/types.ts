import type { PlatformId } from "@/types/esport";

/** kakaxi 调度队列中的一条待执行盘口 */
export interface KakaxiQueuedBet {
  matchId: number;
  betId: number;
  enqueuedAt: number;
  implied: number;
  isLive: boolean;
  /** detect 产出的套利腿平台，用于并行调度互斥 */
  homePlatform?: PlatformId;
  awayPlatform?: PlatformId;
}

export function kakaxiBetKey(matchId: number, betId: number): string {
  return `${matchId}:${betId}`;
}
