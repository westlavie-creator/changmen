/** IA getPointsListSplit child 字段解析（无回传策略） */

export function betKeyFromChild(child: Record<string, unknown>): string {
  const map = child.match;
  const prefix = map !== 0 && map != null ? `[地图${map}]` : "[全场]";
  return `${prefix}${child.name ?? ""}`;
}

export function parseIaPoint(pt: Record<string, unknown> | undefined): number {
  if (!pt) return 0;
  const n = Number(pt.point);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

/** [A8 可证实] status=1 赛前开放；[changmen 扩展] status=2 滚球开放（core.js isLive、用户抓包 373635） */
export function iaPointBettable(status: unknown): boolean {
  const s = Number(status);
  return s === 1 || s === 2;
}

/** SaveBet / 下注校验：单选项封盘，仅看 point.status */
export function iaPointLocked(pt: Record<string, unknown> | undefined): boolean {
  if (!pt?.id) return true;
  return !iaPointBettable(pt.status);
}

/**
 * fo 展示封盘：[A8 可证实] HTTP 灌盘 `point.status !== 1`（含滚球 status=2）。
 * 滚球开放赔率由 WS `push_point_change` 强制 isLock=false 写入 fo。
 * child.status=0 为 BO5 全场滚球常见哨兵，不因此封盘；其余不可下注的 child.status 整盘封。
 */
export function iaPointLockedForFo(
  pt: Record<string, unknown> | undefined,
  child: Record<string, unknown>,
): boolean {
  if (!pt?.id) return true;
  const childStatus = Number(child.status);
  if (childStatus !== 0 && !iaPointBettable(childStatus)) return true;
  return Number(pt.status) !== 1;
}

/** [A8 可证实] WS `bet_item_single_lock`：仅 status===1 为开放 */
export function iaWsPlayLocked(status: unknown): boolean {
  return Number(status) !== 1;
}

/** SaveBet 整行 Status：所有已有选项都封盘才 Locked */
export function iaChildLocked(
  child: Record<string, unknown>,
  homePt?: Record<string, unknown>,
  awayPt?: Record<string, unknown>,
): boolean {
  const childStatus = Number(child.status);
  if (childStatus !== 0 && !iaPointBettable(childStatus)) return true;
  const points = [homePt, awayPt].filter((pt) => pt?.id) as Array<Record<string, unknown>>;
  if (!points.length) return !iaPointBettable(child.status);
  return points.every((pt) => iaPointLocked(pt));
}
