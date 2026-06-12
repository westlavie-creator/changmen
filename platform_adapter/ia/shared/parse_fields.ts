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

export function iaChildLocked(
  child: Record<string, unknown>,
  homePt?: Record<string, unknown>,
  awayPt?: Record<string, unknown>,
): boolean {
  return child.status !== 1 || homePt?.status !== 1 || awayPt?.status !== 1;
}
