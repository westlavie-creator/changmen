import type { OrderRow } from "@/types/order";
import { hasOpenPolymarketPosition } from "@venue/polymarket/pmLogicalPosition";
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
    if (!map.has(key))
      map.set(key, []);
    map.get(key)!.push(row);
  }
  return map;
}

export function orderLinkMapEntries<T>(map: Map<number, T[]>): [number, T[]][] {
  return [...map.entries()];
}

const LOSE_REJECT = new Set(["Reject", "Return"]);

function isPolymarketOrderRow(row: OrderRow): boolean {
  return String(row.Type ?? "").trim() === "Polymarket";
}

/** PM 仍有持仓；卖单永远不算持仓 */
export function isPolymarketOpenPosition(row: OrderRow): boolean {
  return hasOpenPolymarketPosition(row);
}

/** 侧栏列表展示行：PM 卖单不占独立行（历史数据兜底） */
export function orderListDisplayRows(rows: OrderRow[]): OrderRow[] {
  return rows.filter(r => !(isPolymarketOrderRow(r) && r.PmSide === "sell"));
}

/** 组内盈亏：各腿 Money 合计（PM 卖单跳过，避免与买单重复） */
export function computeOrderGroupProfit(rows: OrderRow[]): number {
  return rows
    .filter(r => !(isPolymarketOrderRow(r) && r.PmSide === "sell"))
    .reduce((sum, r) => sum + (Number(r.Money) || 0), 0);
}

/** [A8 可证实] OrderView legend：未结 Status=None 各腿 bet×odds−stake 用 ` - ` 拼接；已结为组盈亏 */
export function orderLinkLegend(rows: OrderRow[]): string {
  const link = linkIdGroupKey(rows[0]?.Link);
  const prefix = isSingleLegLink(link) ? `${formatLinkId(link)} ` : "";
  const stake = rows
    .filter(r => !LOSE_REJECT.has(String(r.Status)) && r.PmSide !== "sell")
    .reduce((sum, r) => sum + (Number(r.BetMoney) || 0), 0);
  const unsettledPreview = rows
    .filter(r => String(r.Status ?? "") === "None" && r.PmSide !== "sell")
    .map((r) => {
      const odds = Number(r.Odds) || 0;
      const bet = Number(r.BetMoney) || 0;
      return toFixed(bet * odds - stake, 0);
    });
  if (unsettledPreview.length)
    return prefix + unsettledPreview.join(" - ");
  const total = computeOrderGroupProfit(rows);
  const sign = total > 0 ? "+" : "";
  return prefix + sign + toFixed(total, 0);
}

/** [changmen 扩展] 套利双腿 fieldset 高亮：跨平台且同 Link；纯 PM 买卖同组不算套利 */
export function isLinkedArbOrderGroup(rows: OrderRow[]): boolean {
  const link = linkIdGroupKey(rows[0]?.Link);
  if (link === 0 || isSingleLegLink(link) || rows.length < 2)
    return false;
  const providers = new Set(
    rows.map(r => String(r.Type ?? "").trim()).filter(Boolean),
  );
  return providers.size >= 2;
}
