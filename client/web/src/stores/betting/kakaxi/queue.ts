import { kakaxiBetKey, type KakaxiQueuedBet } from "@/stores/betting/kakaxi/types";

const queue: KakaxiQueuedBet[] = [];
const keys = new Set<string>();

function comparePriority(a: KakaxiQueuedBet, b: KakaxiQueuedBet): number {
  if (a.isLive !== b.isLive) return a.isLive ? -1 : 1;
  if (b.implied !== a.implied) return b.implied - a.implied;
  return a.enqueuedAt - b.enqueuedAt;
}

/** 入队；已存在则刷新 implied / isLive，返回是否为新条目 */
export function enqueueKakaxiBet(item: KakaxiQueuedBet): boolean {
  const key = kakaxiBetKey(item.matchId, item.betId);
  const existingIdx = queue.findIndex(
    (row) => row.matchId === item.matchId && row.betId === item.betId,
  );
  if (existingIdx >= 0) {
    const prev = queue[existingIdx];
    queue[existingIdx] = {
      ...prev,
      implied: Math.max(prev.implied, item.implied),
      isLive: prev.isLive || item.isLive,
    };
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
): boolean {
  const existingIdx = queue.findIndex(
    (row) => row.matchId === matchId && row.betId === betId,
  );
  if (existingIdx < 0) return false;
  const prev = queue[existingIdx];
  queue[existingIdx] = {
    ...prev,
    implied: Math.max(prev.implied, implied),
    isLive: prev.isLive || isLive,
  };
  return true;
}

/** 按 live → implied → 入队时间取出队首 */
export function dequeueKakaxiBet(): KakaxiQueuedBet | undefined {
  if (!queue.length) return undefined;
  let bestIdx = 0;
  for (let i = 1; i < queue.length; i++) {
    if (comparePriority(queue[i], queue[bestIdx]) < 0) {
      bestIdx = i;
    }
  }
  const [next] = queue.splice(bestIdx, 1);
  keys.delete(kakaxiBetKey(next.matchId, next.betId));
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
