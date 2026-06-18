import { kakaxiBetKey, type KakaxiQueuedBet } from "@/stores/betting/kakaxi/types";
import type { PlatformId } from "@/types/esport";
import {
  kakaxiQueuedBetPlatforms,
  platformsConflict,
} from "@/stores/betting/kakaxi/platformResolve";

const queue: KakaxiQueuedBet[] = [];
const keys = new Set<string>();

function comparePriority(a: KakaxiQueuedBet, b: KakaxiQueuedBet): number {
  if (a.isLive !== b.isLive) return a.isLive ? -1 : 1;
  if (b.implied !== a.implied) return b.implied - a.implied;
  return a.enqueuedAt - b.enqueuedAt;
}

function mergeQueuedBet(prev: KakaxiQueuedBet, item: KakaxiQueuedBet): KakaxiQueuedBet {
  return {
    ...prev,
    implied: Math.max(prev.implied, item.implied),
    isLive: prev.isLive || item.isLive,
    homePlatform: item.homePlatform ?? prev.homePlatform,
    awayPlatform: item.awayPlatform ?? prev.awayPlatform,
  };
}

/** 入队；已存在则刷新 implied / isLive，返回是否为新条目 */
export function enqueueKakaxiBet(item: KakaxiQueuedBet): boolean {
  const key = kakaxiBetKey(item.matchId, item.betId);
  const existingIdx = queue.findIndex(
    (row) => row.matchId === item.matchId && row.betId === item.betId,
  );
  if (existingIdx >= 0) {
    queue[existingIdx] = mergeQueuedBet(queue[existingIdx], item);
    return false;
  }
  keys.add(key);
  queue.push(item);
  return true;
}

/** improved 时提升 implied / live，不入新队 */
export function boostKakaxiBetImplied(
  matchId: number,
  betId: number,
  implied: number,
  isLive: boolean,
  platforms?: Pick<KakaxiQueuedBet, "homePlatform" | "awayPlatform">,
): boolean {
  const existingIdx = queue.findIndex(
    (row) => row.matchId === matchId && row.betId === betId,
  );
  if (existingIdx < 0) return false;
  const prev = queue[existingIdx];
  queue[existingIdx] = mergeQueuedBet(prev, {
    matchId,
    betId,
    enqueuedAt: prev.enqueuedAt,
    implied,
    isLive,
    ...platforms,
  });
  return true;
}

/** 按 live → implied → 入队时间取出队首 */
export function dequeueKakaxiBet(): KakaxiQueuedBet | undefined {
  return dequeueKakaxiBetExcludingPlatforms(new Set());
}

/**
 * 取出队首且平台腿不与 busy 冲突的条目。
 * resolvePlatforms 用于入队时未带 home/away 的兼容路径。
 */
export function dequeueKakaxiBetExcludingPlatforms(
  busyPlatforms: ReadonlySet<PlatformId>,
  resolvePlatforms?: (item: KakaxiQueuedBet) => PlatformId[] | undefined,
): KakaxiQueuedBet | undefined {
  if (!queue.length) return undefined;

  let bestIdx = -1;
  let bestPlatforms: PlatformId[] | undefined;

  for (let i = 0; i < queue.length; i++) {
    const item = queue[i];
    const platforms =
      kakaxiQueuedBetPlatforms(item) ?? resolvePlatforms?.(item) ?? undefined;
    if (platforms?.length) {
      if (platformsConflict(platforms, busyPlatforms)) continue;
    } else if (busyPlatforms.size > 0) {
      continue;
    }

    if (bestIdx < 0 || comparePriority(item, queue[bestIdx]) < 0) {
      bestIdx = i;
      bestPlatforms = platforms;
    }
  }

  if (bestIdx < 0) return undefined;

  const [next] = queue.splice(bestIdx, 1);
  keys.delete(kakaxiBetKey(next.matchId, next.betId));

  if (bestPlatforms && (!next.homePlatform || !next.awayPlatform)) {
    next.homePlatform = bestPlatforms[0];
    next.awayPlatform = bestPlatforms[1];
  }

  return next;
}

export function removeKakaxiBet(matchId: number, betId: number): void {
  const key = kakaxiBetKey(matchId, betId);
  const idx = queue.findIndex((row) => row.matchId === matchId && row.betId === betId);
  if (idx >= 0) queue.splice(idx, 1);
  keys.delete(key);
}

export function clearKakaxiQueue(): void {
  queue.length = 0;
  keys.clear();
}

export function kakaxiQueueSize(): number {
  return queue.length;
}

export function hasKakaxiBet(matchId: number, betId: number): boolean {
  return keys.has(kakaxiBetKey(matchId, betId));
}
