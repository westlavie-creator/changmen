import type { LoseOrderCancelledRecord, OrderRow } from "@/types/order";
import type { LoseOrder } from "@/models/loseOrder";
import { hasOpenPolymarketPosition, resolvePmRemainingShares } from "@changmen/venue-adapter/polymarket";
import { formatLinkId, isSingleLegLink, orderLinkSortKey, toFixed } from "@changmen/client-core/shared/format";
import { Currency, getExchange } from "@changmen/shared/currency";

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

/** 侧栏订单行：展示全部腿（含 PM changmen 卖单） */
export function orderListDisplayRows(rows: OrderRow[]): OrderRow[] {
  return rows.filter(r => !isMakeupCancelledOrderRow(r));
}

/** 本地日历日 YYYY-MM-DD（与侧栏 orderDate 一致） */
export function toOrderDateKeyLocal(ts: number): string {
  const d = new Date(Number(ts) || Date.now());
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/**
 * [changmen 扩展] 订单归账时间戳：PM 卖单跟对应买单 CreateAt，
 * 使跨日卖出在买单日展示并计入当日盈亏。
 */
export function orderProfitDateTs(row: OrderRow, peers: OrderRow[]): number {
  if (isPolymarketOrderRow(row) && row.PmSide === "sell") {
    const buyId = String(row.PmBuyOrderId ?? "").trim().toLowerCase();
    if (buyId) {
      const buy = peers.find(r =>
        isPolymarketOrderRow(r)
        && r.PmSide !== "sell"
        && String(r.OrderID ?? "").trim().toLowerCase() === buyId,
      );
      const buyAt = Number(buy?.CreateAt) || 0;
      if (buyAt > 0)
        return buyAt;
    }
    const link = Number(row.Link) || 0;
    const buyAts = peers
      .filter(r =>
        isPolymarketOrderRow(r)
        && r.PmSide !== "sell"
        && (link === 0 || (Number(r.Link) || 0) === link),
      )
      .map(r => Number(r.CreateAt) || 0)
      .filter(n => n > 0);
    if (buyAts.length)
      return Math.min(...buyAts);
  }
  return Number(row.CreateAt) || 0;
}

export function orderBelongsToDateKey(
  row: OrderRow,
  dateKey: string,
  peers: OrderRow[],
): boolean {
  const at = orderProfitDateTs(row, peers);
  if (!at)
    return true;
  return toOrderDateKeyLocal(at) === dateKey;
}

/**
 * 按日展示过滤：
 * - 含 PM 卖单的 Link 组：整组跟买单日（卖出日不再出现）
 * - 无 PM 卖单：保留跨日 sibling 整组（套利腿不拆）
 */
export function filterOrdersBelongingToDate(
  list: OrderRow[],
  dateKey: string,
): OrderRow[] {
  const groups = groupOrdersByLink(list);
  const out: OrderRow[] = [];
  for (const rows of groups.values()) {
    const pmSells = rows.filter(r => isPolymarketOrderRow(r) && r.PmSide === "sell");
    if (pmSells.length) {
      const anchors = pmSells
        .map(s => orderProfitDateTs(s, rows))
        .filter(n => n > 0);
      if (anchors.length) {
        const anchorDay = toOrderDateKeyLocal(Math.min(...anchors));
        if (anchorDay !== dateKey)
          continue;
      }
      out.push(...rows);
      continue;
    }
    out.push(...rows);
  }
  return out;
}

/**
 * [changmen 扩展] 去掉「仅有 PM 卖单、无买单/他场馆腿」的 Link 组。
 * 卖单必须跟买单同组展示；孤儿卖单不单独占一组。
 */
export function dropOrphanPolymarketSellGroups(
  groups: Map<number, OrderRow[]>,
): Map<number, OrderRow[]> {
  const out = new Map<number, OrderRow[]>();
  for (const [link, rows] of groups) {
    const hasPmSell = rows.some(r => isPolymarketOrderRow(r) && r.PmSide === "sell");
    if (!hasPmSell) {
      out.set(link, rows);
      continue;
    }
    const hasPmBuy = rows.some(r => isPolymarketOrderRow(r) && r.PmSide !== "sell");
    const hasOtherVenue = rows.some(r => !isPolymarketOrderRow(r) && !isMakeupSyntheticOrderRow(r));
    if (hasPmBuy || hasOtherVenue)
      out.set(link, rows);
  }
  return out;
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

/** 组内盈亏：优先买单 Money（新模型）；买单仍为 0 时回退卖单 Money（迁移前旧数据） */
export function polymarketMoneyForAggregate(row: OrderRow, peers: OrderRow[]): number {
  if (isMakeupSyntheticOrderRow(row))
    return 0;
  if (!isPolymarketOrderRow(row))
    return Number(row.Money) || 0;

  if (row.PmSide === "sell") {
    const buyId = String(row.PmBuyOrderId ?? "").trim().toLowerCase();
    if (buyId) {
      const buy = peers.find(r =>
        isPolymarketOrderRow(r)
        && r.PmSide !== "sell"
        && String(r.OrderID ?? "").trim().toLowerCase() === buyId,
      );
      // 新模型：盈亏已累加到买单
      if (buy && Math.abs(Number(buy.Money) || 0) > 1e-9)
        return 0;
    }
    // 旧数据 / orphan：盈亏仍在卖单
    return Number(row.Money) || 0;
  }

  return Number(row.Money) || 0;
}

/** 组内盈亏合计 */
export function computeOrderGroupProfit(rows: OrderRow[]): number {
  return rows.reduce((sum, r) => sum + polymarketMoneyForAggregate(r, rows), 0);
}

/** PM 买单已无剩余持仓（含 FOK 尘量卖光但仍标 partial） */
function isPmExitedBuy(row: OrderRow): boolean {
  if (!isPolymarketOrderRow(row) || row.PmSide === "sell")
    return false;
  const state = String(row.PmSellState ?? "").toLowerCase();
  if (state === "closed" || state === "settled")
    return true;
  const attr = Number(row.PmAttributedSellShares) || 0;
  if (state === "partial" || attr > 0)
    return resolvePmRemainingShares(row) <= 0;
  return false;
}

function orderLegendExposureBet(row: OrderRow): number {
  if (isPolymarketOrderRow(row)) {
    const usdc = Number(row.PmStakeUsdc) || 0;
    if (usdc > 0)
      return usdc * getExchange(Currency.USDT);
  }
  return Number(row.BetMoney) || 0;
}

function pmTokenKey(row: OrderRow): string {
  if (!isPolymarketOrderRow(row) || row.PmSide === "sell")
    return "";
  return String(row.PmTokenId ?? "").trim().toLowerCase();
}

/**
 * [changmen 扩展] 未结预览分组：
 * - PM：同一 `PmTokenId` = 同一腿（同向多笔）
 * - 其它场馆 / 无 token：每笔订单单独一腿（不按队名/Item 互并）
 */
export function groupRowsByOutcomeSide(rows: OrderRow[]): OrderRow[][] {
  const tokenBuckets = new Map<string, OrderRow[]>();
  const perOrder: OrderRow[][] = [];

  for (const row of rows) {
    const token = pmTokenKey(row);
    if (token) {
      const list = tokenBuckets.get(token) ?? [];
      list.push(row);
      tokenBuckets.set(token, list);
      continue;
    }
    perOrder.push([row]);
  }

  return [...tokenBuckets.values(), ...perOrder];
}

/**
 * [A8 可证实] OrderView legend：未结预览 bet×odds−stake；已结为组盈亏。
 * [changmen 扩展]
 * - 分隔符用 ` / `（A8 为 ` - `），避免负数拼成 `-281 - -114`
 * - PM 同 token 合并为一腿；其它场馆按订单各算一条
 */
export function orderLinkLegend(rows: OrderRow[]): string {
  const link = linkIdGroupKey(rows[0]?.Link);
  const prefix = isSingleLegLink(link) ? `${formatLinkId(link)} ` : "";
  const stake = rows
    .filter(r =>
      !LOSE_REJECT.has(String(r.Status))
      && r.PmSide !== "sell"
      && !isMakeupSyntheticOrderRow(r)
      && !isPmExitedBuy(r),
    )
    .reduce((sum, r) => sum + orderLegendExposureBet(r), 0);
  const hasMakeup = rows.some(isMakeupPendingOrderRow);
  const makeupPrefix = hasMakeup ? "补单中 · " : "";
  const unsettled = rows.filter(r =>
    String(r.Status ?? "") === "None"
    && r.PmSide !== "sell"
    && !isPmExitedBuy(r),
  );
  const sideGroups = groupRowsByOutcomeSide(unsettled);
  const unsettledPreview = sideGroups.map((sideRows) => {
    const payout = sideRows.reduce(
      (sum, r) => sum + orderLegendExposureBet(r) * (Number(r.Odds) || 0),
      0,
    );
    return toFixed(payout - stake, 0);
  });
  if (unsettledPreview.length)
    return makeupPrefix + prefix + unsettledPreview.join(" / ");
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
