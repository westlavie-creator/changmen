import type { OrderRow } from "@/types/order";
import { formatLinkId, isSingleLegLink, toFixed } from "@/shared/format";

/** [A8 可证实] 与 bundle `Io.getOrders` 一致：分组键即 `Link` */
export function linkIdGroupKey(link: number | null | undefined): number {
  const n = Number(link);
  return Number.isFinite(n) ? n : 0;
}

/** [A8 可证实] `T.sort((S,P)=>S.Link>P.Link?-1:1)` */
export function sortOrdersByLinkDesc<T extends { Link?: number }>(list: T[]): T[] {
  return [...list].sort(
    (a, b) => linkIdGroupKey(b.Link) - linkIdGroupKey(a.Link),
  );
}

/** [A8 可证实] `ft.groupBy(T, S=>S.Link)`（先按 Link 降序） */
export function groupOrdersByLink<T extends { Link?: number }>(list: T[]): Map<number, T[]> {
  const sorted = sortOrdersByLinkDesc(list);
  const map = new Map<number, T[]>();
  for (const row of sorted) {
    const key = linkIdGroupKey(row.Link);
    if (!map.has(key)) map.set(key, []);
    map.get(key)!.push(row);
  }
  return map;
}

export function orderLinkMapEntries<T>(map: Map<number, T[]>): [number, T[]][] {
  return [...map.entries()];
}

const LOSE_REJECT = new Set(["Reject", "Return"]);

/** [A8 可证实] OrderView legend：未结 `bet*odds-stake` 用 ` - ` 拼接，已结为 Money 合计 */
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

/** 同 Link 且非单边、双腿以上 → fieldset `orderlink--paired` */
export function isLinkedArbOrderGroup(rows: OrderRow[]): boolean {
  const link = linkIdGroupKey(rows[0]?.Link);
  return link !== 0 && !isSingleLegLink(link) && rows.length > 1;
}
