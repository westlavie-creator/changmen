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

/** 单选项是否封盘：仅看 point.status，不看 child.status */
export function iaPointLocked(pt: Record<string, unknown> | undefined): boolean {
  if (!pt?.id) return true;
  return !iaPointBettable(pt.status);
}

/** SaveBet 整行 Status：所有已有选项都封盘才 Locked */
export function iaChildLocked(
  child: Record<string, unknown>,
  homePt?: Record<string, unknown>,
  awayPt?: Record<string, unknown>,
): boolean {
  const points = [homePt, awayPt].filter((pt) => pt?.id) as Array<Record<string, unknown>>;
  if (!points.length) return !iaPointBettable(child.status);
  return points.every((pt) => iaPointLocked(pt));
}
