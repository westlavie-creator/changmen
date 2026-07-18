import type { LoseOrderCancelledRecord, OrderRow } from "@/types/order";
import type { LoseOrder } from "@/models/loseOrder";
import { hasOpenPolymarketPosition } from "@changmen/venue-adapter/polymarket";
import { formatLinkId, isSingleLegLink, orderLinkSortKey, toFixed } from "@changmen/client-core/shared/format";

/** [A8 可证实] 展示/筛选用 Link 数值；分组键见 `groupOrdersByLink` 直接用 `S.Link` */
export function linkIdGroupKey(link: number | null | undefined): number {
  const n = Number(link);
  return Number.isFinite(n) ? n : 0;
}

/**
 * [changmen 扩展] 按「时间序」降序：套利/9999 用 |Link|；
 * 正 EV 用 orderLinkSortKey 还原真实时间戳，避免 7e15 编码打乱排序。
 */
export function compareOrderLinkDesc(
  a: { Link?: number },
  b: { Link?: number },
): number {
  const aLink = orderLinkSortKey(a.Link);
  const bLink = orderLinkSortKey(b.Link);
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

/** 侧栏列表展示行：PM 卖单不占独立行；已取消补单占位不展示 */
/** 侧栏订单行：展示全部腿（含 PM changmen 卖单） */
export function orderListDisplayRows(rows: OrderRow[]): OrderRow[] {
  return rows.filter(r => !isMakeupCancelledOrderRow(r));
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

/** [changmen 扩展] 手动改绑：源 Link 须严格新于目标 Link */
export function canRebindOrderLinkTo(
  fromLink: number | null | undefined,
  toLink: number | null | undefined,
): boolean {
  const from = Number(fromLink);
  const to = Number(toLink);
  if (!Number.isFinite(from) || !Number.isFinite(to) || from === 0 || to === 0)
    return false;
  if (from === to)
    return false;
  return orderLinkSortKey(from) > orderLinkSortKey(to);
}

/** 从 bet 抽出地图槽（全场 / 地图N）；无法识别则 "—" */
export function parseOrderBetMapLabel(bet: string | null | undefined): string {
  const s = String(bet || "").trim();
  if (!s)
    return "—";
  const bracketMap = /^\[地图\s*(\d+)\]/.exec(s);
  if (bracketMap)
    return `地图${bracketMap[1]}`;
  const bracketFull = /^\[全场\]/.exec(s);
  if (bracketFull)
    return "全场";
  const plainMap = /^地图\s*(\d+)/.exec(s);
  if (plainMap)
    return `地图${plainMap[1]}`;
  const enMap = /^Map\s*(\d+)\b/i.exec(s);
  if (enMap)
    return `地图${enMap[1]}`;
  if (/全场/.test(s))
    return "全场";
  return "—";
}

/** 归一化对阵：去 HTML、运动前缀、Game/Map 后缀；主客对调视为同场 */
export function normalizeOrderMatchKey(match: string | null | undefined): string {
  let raw = String(match || "")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
  if (!raw)
    return "";
  // PM 等：`LoL: Team A vs Team B - Game 2 Winner`
  raw = raw.replace(
    /^(lol|league of legends|dota\s*2?|cs:?go|cs2|counter[- ]?strike|valorant|val|kog|王者荣耀|英雄联盟)\s*[:：\-–—]\s*/i,
    "",
  );
  const parts = raw.split(/\s+vs\.?\s+|\s+v\.?\s+/i);
  if (parts.length === 2) {
    const clean = (s: string) => s
      .replace(/\s*[-–—]\s*(game|map|地图)\s*\d+\b.*$/i, "")
      .replace(/\s*[-–—]\s*.*\b(winner|获胜|胜负)\b.*$/i, "")
      .trim();
    const a = clean(parts[0]);
    const b = clean(parts[1]);
    if (a && b)
      return [a, b].sort().join(" vs ");
  }
  return raw;
}

export type OrderMatchMapFields = {
  Match?: string | null;
  Bet?: string | null;
  match?: string | null;
  bet?: string | null;
};

/** [changmen 扩展] 同场且同地图槽才允许手动关联 */
export function isSameOrderMatchMap(a: OrderMatchMapFields, b: OrderMatchMapFields): boolean {
  const matchA = normalizeOrderMatchKey(a.Match ?? a.match);
  const matchB = normalizeOrderMatchKey(b.Match ?? b.match);
  if (!matchA || !matchB || matchA !== matchB)
    return false;
  const mapA = parseOrderBetMapLabel(a.Bet ?? a.bet);
  const mapB = parseOrderBetMapLabel(b.Bet ?? b.bet);
  if (mapA === "—" || mapB === "—")
    return false;
  return mapA === mapB;
}

/** 真实 RDS 订单行（可拖场馆徽章改绑） */
export function isRebindableOrderRow(row: OrderRow): boolean {
  if (isMakeupSyntheticOrderRow(row))
    return false;
  const id = String(row.OrderID ?? "").trim();
  if (!id || id.startsWith("makeup-"))
    return false;
  const link = Number(row.Link);
  return Number.isFinite(link) && link !== 0;
}

/** 拖放改绑：仅校验新→老 Link（同场同图由用户在确认框核对） */
export function canRebindOrderOnto(
  from: { Link?: number },
  to: { Link?: number },
): boolean {
  return canRebindOrderLinkTo(from.Link, to.Link);
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
  _cancelledMakeup: Map<number, LoseOrderCancelledRecord> = new Map(),
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
  // 手动取消的补单不再并入侧栏（取消即消失，不留 MakeupCancelled 占位）
  return groupOrdersByLink(allRows);
}

/** 组内盈亏：PM 已实现卖出计入卖单 Money；未平仓时跳过卖单避免与未结买单双计 */
export function computeOrderGroupProfit(rows: OrderRow[]): number {
  return rows
    .filter((r) => {
      if (isMakeupSyntheticOrderRow(r))
        return false;
      if (isPolymarketOrderRow(r) && r.PmSide === "sell") {
        const buyId = String(r.PmBuyOrderId ?? "").trim();
        const buy = buyId
          ? rows.find(b => isPolymarketOrderRow(b) && b.PmSide !== "sell" && String(b.OrderID) === buyId)
          : undefined;
        // 无对应买单：仍计卖单；有买单则全平/部份平都计入已实现
        if (!buy)
          return true;
        const state = buy.PmSellState;
        return state === "closed" || state === "settled" || state === "partial";
      }
      return true;
    })
    .reduce((sum, r) => sum + (Number(r.Money) || 0), 0);
}

/** [A8 可证实] OrderView legend：未结 Status=None 各腿 bet×odds−stake 用 ` - ` 拼接；已结为组盈亏 */
export function orderLinkLegend(rows: OrderRow[]): string {
  const link = linkIdGroupKey(rows[0]?.Link);
  const prefix = isSingleLegLink(link) ? `${formatLinkId(link)} ` : "";
  const isPmClosedBuy = (r: OrderRow) =>
    isPolymarketOrderRow(r)
    && r.PmSide !== "sell"
    && (r.PmSellState === "closed" || r.PmSellState === "settled");
  const stake = rows
    .filter(r =>
      !LOSE_REJECT.has(String(r.Status))
      && r.PmSide !== "sell"
      && !isMakeupSyntheticOrderRow(r)
      && !isPmClosedBuy(r),
    )
    .reduce((sum, r) => sum + (Number(r.BetMoney) || 0), 0);
  const hasMakeup = rows.some(isMakeupPendingOrderRow);
  const makeupPrefix = hasMakeup ? "补单中 · " : "";
  const unsettledPreview = rows
    .filter(r =>
      String(r.Status ?? "") === "None"
      && r.PmSide !== "sell"
      && !isPmClosedBuy(r),
    )
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
