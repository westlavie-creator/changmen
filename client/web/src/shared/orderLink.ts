import type { LoseOrderCancelledRecord, OrderRow } from "@/types/order";
import type { LoseOrder } from "@/models/loseOrder";
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

export function isMakeupPendingOrderRow(row: OrderRow): boolean {
  const id = String(row.OrderID ?? "");
  if (id.startsWith("makeup-cancelled-"))
    return false;
  const status = String(row.Status ?? "");
  return status === "Makeup"
    || status === "MakeupPlacing"
    || status === "MakeupSettling"
    || id.startsWith("makeup-");
}

export function isMakeupCancelledOrderRow(row: OrderRow): boolean {
  return String(row.Status ?? "") === "MakeupCancelled"
    || String(row.OrderID ?? "").startsWith("makeup-cancelled-");
}

export function isMakeupSyntheticOrderRow(row: OrderRow): boolean {
  return isMakeupPendingOrderRow(row) || isMakeupCancelledOrderRow(row);
}

export function makeupBetIdFromPendingRow(row: OrderRow): number | null {
  if (!isMakeupPendingOrderRow(row))
    return null;
  const id = String(row.OrderID ?? "");
  const n = Number(id.slice("makeup-".length));
  return Number.isFinite(n) && n > 0 ? n : null;
}

/** [changmen 扩展] 补单占位行盈亏文案 */
export function makeupPendingProfitLabel(row: OrderRow): string {
  switch (String(row.Status ?? "")) {
    case "MakeupPlacing":
      return "下单中";
    case "MakeupSettling":
      return "检测拒单中";
    default:
      if (String(row.Player?.UserName ?? "").includes("PM待确认"))
        return "PM待确认";
      if (String(row.Player?.UserName ?? "").includes("再次被拒"))
        return "再次被拒，补单中";
      return "补单中";
  }
}

function resolveMakeupPendingPresentation(order: LoseOrder): {
  status: string;
  playerUserName: string;
} {
  const pendingPm = String(order.pendingPmOrderId ?? "").trim();
  const phase = pendingPm ? "pm_pending" : order.runtimePhase;
  if (phase === "placing") {
    return { status: "MakeupPlacing", playerUserName: "下单中" };
  }
  if (phase === "settling") {
    return { status: "MakeupSettling", playerUserName: "检测拒单中" };
  }
  if (phase === "pm_pending" || pendingPm) {
    return { status: "Makeup", playerUserName: "补单中 · PM待确认" };
  }
  if (phase === "rejected_retry") {
    return { status: "Makeup", playerUserName: "补单中 · 再次被拒" };
  }
  return { status: "Makeup", playerUserName: "补单中" };
}

/** [changmen 扩展] 补单队列项 → 订单组内「补单中」占位行（同 Link 合并展示） */
export function loseOrderToPendingRow(order: LoseOrder, makeProfit: number): OrderRow {
  const odds = order.getOdds(makeProfit);
  const betMoney = order.getBetMoney(odds);
  const presentation = resolveMakeupPendingPresentation(order);
  return {
    OrderID: `makeup-${order.betId}`,
    Link: order.linkId,
    Type: "—",
    Match: order.match,
    Bet: order.bet,
    Item: order.target,
    Odds: odds,
    BetMoney: betMoney,
    Money: 0,
    Status: presentation.status,
    CreateAt: order.createAt,
    Player: {
      UserName: presentation.playerUserName,
    },
  };
}

/** [changmen 扩展] 手动取消的补单 → Link 组内展示行 */
export function loseOrderToCancelledRow(record: LoseOrderCancelledRecord): OrderRow {
  return {
    OrderID: `makeup-cancelled-${record.betId}`,
    Link: record.linkId,
    Type: "—",
    Match: record.match,
    Bet: record.bet,
    Item: record.target,
    Odds: 0,
    BetMoney: 0,
    Money: 0,
    Status: "MakeupCancelled",
    CreateAt: record.cancelledAt,
    Player: {
      UserName: "补单已手动取消",
    },
  };
}

/** 将 session 补单队列并入已有 Link 分组（不单独展示补单列表） */
export function mergePendingMakeupIntoOrderGroups(
  groups: Map<number, OrderRow[]>,
  loseOrders: Map<number, LoseOrder>,
  makeProfit: number,
  cancelledMakeup: Map<number, LoseOrderCancelledRecord> = new Map(),
): Map<number, OrderRow[]> {
  const allRows: OrderRow[] = [];
  for (const rows of groups.values())
    allRows.push(...rows);
  for (const order of loseOrders.values()) {
    if (!order.linkId)
      continue;
    const syntheticId = `makeup-${order.betId}`;
    if (allRows.some(r => String(r.OrderID) === syntheticId))
      continue;
    allRows.push(loseOrderToPendingRow(order, makeProfit));
  }
  for (const record of cancelledMakeup.values()) {
    if (!record.linkId)
      continue;
    const syntheticId = `makeup-cancelled-${record.betId}`;
    if (allRows.some(r => String(r.OrderID) === syntheticId))
      continue;
    allRows.push(loseOrderToCancelledRow(record));
  }
  return groupOrdersByLink(allRows);
}

/** 组内盈亏：各腿 Money 合计（PM 卖单跳过，避免与买单重复） */
export function computeOrderGroupProfit(rows: OrderRow[]): number {
  return rows
    .filter(r => !(isPolymarketOrderRow(r) && r.PmSide === "sell"))
    .filter(r => !isMakeupSyntheticOrderRow(r))
    .reduce((sum, r) => sum + (Number(r.Money) || 0), 0);
}

/** [A8 可证实] OrderView legend：未结 Status=None 各腿 bet×odds−stake 用 ` - ` 拼接；已结为组盈亏 */
export function orderLinkLegend(rows: OrderRow[]): string {
  const link = linkIdGroupKey(rows[0]?.Link);
  const prefix = isSingleLegLink(link) ? `${formatLinkId(link)} ` : "";
  const stake = rows
    .filter(r => !LOSE_REJECT.has(String(r.Status)) && r.PmSide !== "sell" && !isMakeupSyntheticOrderRow(r))
    .reduce((sum, r) => sum + (Number(r.BetMoney) || 0), 0);
  const hasMakeup = rows.some(isMakeupPendingOrderRow);
  const makeupPrefix = hasMakeup ? "补单中 · " : "";
  const unsettledPreview = rows
    .filter(r => String(r.Status ?? "") === "None" && r.PmSide !== "sell")
    .map((r) => {
      const odds = Number(r.Odds) || 0;
      const bet = Number(r.BetMoney) || 0;
      return toFixed(bet * odds - stake, 0);
    });
  if (unsettledPreview.length)
    return makeupPrefix + prefix + unsettledPreview.join(" - ");
  const total = computeOrderGroupProfit(rows);
  const sign = total > 0 ? "+" : "";
  return makeupPrefix + prefix + sign + toFixed(total, 0);
}

/** [changmen 扩展] 套利双腿 fieldset 高亮：跨平台且同 Link；纯 PM 买卖同组不算套利 */
export function isLinkedArbOrderGroup(rows: OrderRow[]): boolean {
  const link = linkIdGroupKey(rows[0]?.Link);
  if (link === 0 || isSingleLegLink(link) || rows.length < 2)
    return false;
  const providers = new Set(
    rows.map(r => String(r.Type ?? "").trim()).filter(Boolean),
  );
  const hasMakeup = rows.some(isMakeupSyntheticOrderRow);
  if (hasMakeup && rows.length >= 2 && link !== 0 && !isSingleLegLink(link))
    return true;
  return providers.size >= 2;
}
