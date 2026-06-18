import { KAKAXI_QUEUE_TTL_MS } from "@/stores/betting/kakaxi/config";
import { kakaxiBetKey, type KakaxiQueuedBet } from "@/stores/betting/kakaxi/types";
import type { PlatformId } from "@/types/esport";
import {
  kakaxiQueuedBetPlatforms,
  platformsConflict,
} from "@/stores/betting/kakaxi/platformResolve";

const items = new Map<string, KakaxiQueuedBet>();

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
  const prev = items.get(key);
  if (prev) {
    items.set(key, mergeQueuedBet(prev, item));
    return false;
  }
  items.set(key, item);
  return true;
}

/** 闸门失败等场景的轻量回队（保留原 enqueuedAt 以尊重 TTL） */
export function requeueKakaxiBet(item: KakaxiQueuedBet): void {
  enqueueKakaxiBet(item);
}

/** improved 时提升 implied / live，不入新队 */
export function boostKakaxiBetImplied(
  matchId: number,
  betId: number,
  implied: number,
  isLive: boolean,
  platforms?: Pick<KakaxiQueuedBet, "homePlatform" | "awayPlatform">,
): boolean {
  const key = kakaxiBetKey(matchId, betId);
  const prev = items.get(key);
  if (!prev) return false;
  items.set(
    key,
    mergeQueuedBet(prev, {
      matchId,
      betId,
      enqueuedAt: prev.enqueuedAt,
      implied,
      isLive,
      ...platforms,
    }),
  );
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
  if (!items.size) return undefined;

  let best: KakaxiQueuedBet | undefined;
  let bestPlatforms: PlatformId[] | undefined;

  for (const item of items.values()) {
    const platforms =
      kakaxiQueuedBetPlatforms(item) ?? resolvePlatforms?.(item) ?? undefined;
    if (platforms?.length) {
      if (platformsConflict(platforms, busyPlatforms)) continue;
    } else if (busyPlatforms.size > 0) {
      continue;
    }

    if (!best || comparePriority(item, best) < 0) {
      best = item;
      bestPlatforms = platforms;
    }
  }

  if (!best) return undefined;

  const key = kakaxiBetKey(best.matchId, best.betId);
  items.delete(key);

  if (bestPlatforms && (!best.homePlatform || !best.awayPlatform)) {
    best.homePlatform = bestPlatforms[0];
    best.awayPlatform = bestPlatforms[1];
  }

  return best;
}

export function removeKakaxiBet(matchId: number, betId: number): void {
  items.delete(kakaxiBetKey(matchId, betId));
}

/** 丢弃超过 TTL 的队列条目，返回清理数量 */
export function pruneExpiredKakaxiQueue(now = Date.now()): number {
  let pruned = 0;
  for (const [key, item] of items) {
    if (now - item.enqueuedAt > KAKAXI_QUEUE_TTL_MS) {
      items.delete(key);
      pruned += 1;
    }
  }
  return pruned;
}

export function clearKakaxiQueue(): void {
  items.clear();
}

export function kakaxiQueueSize(): number {
  return items.size;
}

export function hasKakaxiBet(matchId: number, betId: number): boolean {
  return items.has(kakaxiBetKey(matchId, betId));
}
