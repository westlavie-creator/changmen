/** [changmen 扩展] 可自动下单机会与后续执行结果的挂钩（同轮 processArbBet 续报） */

const pending = new Map<string, number>();

function key(matchId: number, betId: number): string {
  return `${matchId}:${betId}`;
}

export function markOpportunityPending(matchId: number, betId: number): void {
  pending.set(key(matchId, betId), Date.now());
}

export function clearOpportunityPending(matchId: number, betId: number): void {
  pending.delete(key(matchId, betId));
}

export function hasOpportunityPending(matchId: number, betId: number): boolean {
  return pending.has(key(matchId, betId));
}

/** 从 trace id `matchId:betId:startedAt` 解析 */
export function clearOpportunityPendingFromTraceId(traceId: string): void {
  const parts = traceId.split(":");
  if (parts.length < 2) return;
  const matchId = Number(parts[0]);
  const betId = Number(parts[1]);
  if (!Number.isFinite(matchId) || !Number.isFinite(betId)) return;
  clearOpportunityPending(matchId, betId);
}

/** @internal 测试重置 */
export function resetOpportunityLinkForTest(): void {
  pending.clear();
}
