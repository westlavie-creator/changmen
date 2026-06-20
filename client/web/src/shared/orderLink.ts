import type { OrderRow } from "@/types/order";
import { formatLinkId, isSingleLegLink, toFixed } from "@/shared/format";

/** [A8 可证实] 展示/筛选用 Link 数值；分组键见 `groupOrdersByLink` 直接用 `S.Link` */
export function linkIdGroupKey(link: number | null | undefined): number {
  const n = Number(link);
  return Number.isFinite(n) ? n : 0;
}

/** [changmen 扩展] A8 原版按 Link 原值降序；changmen 取绝对值排序，使 9999 单边负 Link 按时间归位 */
export function compareOrderLinkDesc(
  a: { Link?: number },
  b: { Link?: number },
): number {
  const aLink = Math.abs(Number(a.Link));
  const bLink = Math.abs(Number(b.Link));
  return aLink > bLink ? -1 : 1;
}

/** [A8 可证实] `T.sort((S,P)=>S.Link>P.Link?-1:1)` */
export function sortOrdersByLinkDesc<T extends { Link?: number }>(list: T[]): T[] {
  return [...list].sort(compareOrderLinkDesc);
}

/** [A8 可证实] `ft.groupBy(T, S=>S.Link)`（先 `T.sort` Link 降序） */
export function groupOrdersByLink<T extends { Link?: number }>(list: T[]): Map<number, T[]> {
  const sorted = sortOrdersByLinkDesc(list);
  const map = new Map<number, T[]>();
  for (const row of sorted) {
    const key = Number(row.Link);
    if (!map.has(key)) map.set(key, []);
    map.get(key)!.push(row);
  }
  return map;
}

export function orderLinkMapEntries<T>(map: Map<number, T[]>): [number, T[]][] {
  return [...map.entries()];
}

const LOSE_REJECT = new Set(["Reject", "Return"]);

/** [changmen 扩展] 9999 单边负 Link 前缀；A8 legend 无前缀 */
export function orderLinkLegend(rows: OrderRow[]): string {
  const link = linkIdGroupKey(rows[0]?.Link);
  const prefix = isSingleLegLink(link) ? `${formatLinkId(link)} ` : "";
  const stake = rows
    .filter((r) => !LOSE_REJECT.has(String(r.Status)))
    .reduce((sum, r) => sum + (Number(r.BetMoney) || 0), 0);
  const unsettled = rows
    .filter((r) => r.Status === "None")
    .map((r) => {
      const odds = Number(r.Odds) || 0;
      const bet = Number(r.BetMoney) || 0;
      return toFixed(bet * odds - stake, 0);
    });
  if (unsettled.length) return prefix + unsettled.join(" - ");
  const total = rows.reduce((sum, r) => sum + (Number(r.Money) || 0), 0);
  return prefix + toFixed(total, 0);
}

/** [changmen 扩展] A8 fieldset 仅 `orderlink`，无 `--paired` */
export function isLinkedArbOrderGroup(rows: OrderRow[]): boolean {
  const link = linkIdGroupKey(rows[0]?.Link);
  return link !== 0 && !isSingleLegLink(link) && rows.length > 1;
}
