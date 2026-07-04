import type { OrderRow } from "@/types/order";
import { USDT_CNY_EXCHANGE } from "@changmen/shared/account_multiply";
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

/** [A8 可证实] `ft.groupBy(T, S=>S.Link)`（先 `T.sort` Link 降序）
 *
 * [changmen 扩展] 绑定分层：
 * 1. PM 买卖：`PmBuyOrderId` 归组 + 入库继承买单 Link（见 order_store / persistChangmenSellOrder）
 * 2. 套利双腿：`saveOrderBind` 写入共享 LinkID（finalizeArbBet）；PM 卖单继承 PM 买单 Link 后自然与对腿同组
 */
export function groupOrdersByLink<T extends { Link?: number; OrderID?: number | string; Type?: string; PmSide?: string; PmBuyOrderId?: string }>(list: T[]): Map<number, T[]> {
  const sorted = sortOrdersByLinkDesc(list);
  const map = new Map<number, T[]>();
  for (const row of sorted) {
    const key = Number(row.Link);
    if (!map.has(key))
      map.set(key, []);
    map.get(key)!.push(row);
  }
  return attachPolymarketSellsToBuyGroups(map);
}

/** PM 卖单 PmBuyOrderId → 归入对应买单 Link 组（CLOB 同步时卖单常有独立占位 link） */
function attachPolymarketSellsToBuyGroups<T extends { Link?: number; OrderID?: number | string; Type?: string; PmSide?: string; PmBuyOrderId?: string; CreateAt?: number }>(
  map: Map<number, T[]>,
): Map<number, T[]> {
  const buyLinkById = new Map<string, number>();
  for (const [link, rows] of map.entries()) {
    for (const row of rows) {
      const id = String(row.OrderID ?? "").trim();
      if (!id || String(row.Type ?? "") !== "Polymarket" || row.PmSide === "sell")
        continue;
      buyLinkById.set(id, link);
    }
  }

  for (const [sellLink, rows] of [...map.entries()]) {
    const keep: T[] = [];
    for (const row of rows) {
      const isPmSell = String(row.Type ?? "") === "Polymarket" && row.PmSide === "sell";
      const buyId = String(row.PmBuyOrderId ?? "").trim();
      const buyLink = buyId ? buyLinkById.get(buyId) : undefined;
      if (isPmSell && buyLink != null && buyLink !== sellLink) {
        const target = map.get(buyLink) ?? [];
        target.push(row);
        map.set(buyLink, target);
        continue;
      }
      keep.push(row);
    }
    if (keep.length)
      map.set(sellLink, keep);
    else
      map.delete(sellLink);
  }

  for (const rows of map.values()) {
    rows.sort((a, b) => {
      const aSell = a.PmSide === "sell" ? 1 : 0;
      const bSell = b.PmSide === "sell" ? 1 : 0;
      if (aSell !== bSell)
        return aSell - bSell;
      return (Number(a.CreateAt) || 0) - (Number(b.CreateAt) || 0);
    });
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

/** PM 仍有持仓；卖单永远不算持仓（默认无 fill 数据时视为持有待结算） */
export function isPolymarketOpenPosition(row: OrderRow): boolean {
  return hasOpenPolymarketPosition(row);
}

function pmSellCostCny(sell: OrderRow, pmBuys: OrderRow[]): number {
  const stakeUsdc = Number(sell.PmStakeUsdc) || 0;
  if (stakeUsdc > 0.001)
    return Math.round(stakeUsdc * USDT_CNY_EXCHANGE);
  const buyId = String(sell.PmBuyOrderId ?? "").trim();
  if (!buyId)
    return 0;
  const buy = pmBuys.find(b => String(b.OrderID ?? "") === buyId);
  return buy ? (Number(buy.BetMoney) || 0) : 0;
}

/** 同组内绑定到该买单的 PM 卖单 */
export function pmBuyLinkedSells(buy: OrderRow, groupRows: OrderRow[]): OrderRow[] {
  const buyId = String(buy.OrderID ?? "").trim();
  if (!buyId)
    return [];
  return groupRows.filter(
    r => isPolymarketOrderRow(r)
      && r.PmSide === "sell"
      && String(r.PmBuyOrderId ?? "").trim() === buyId,
  );
}

/** 绑定卖单成交摘要（嵌在买单最下方，仅卖单侧字段） */
export interface PmBoundSellFillLine {
  shares: number | null;
  proceedsCny: number;
  odds: number;
  createAt: number;
}

export function pmBuyBoundSellFills(buy: OrderRow, groupRows: OrderRow[]): PmBoundSellFillLine[] {
  return pmBuyLinkedSells(buy, groupRows)
    .slice()
    .sort((a, b) => (Number(a.CreateAt) || 0) - (Number(b.CreateAt) || 0))
    .map((sell) => {
      const shares = Number(sell.PmShares);
      return {
        shares: Number.isFinite(shares) && shares > 0.0001 ? shares : null,
        proceedsCny: Number(sell.BetMoney) || 0,
        odds: Number(sell.Odds) || 0,
        createAt: Number(sell.CreateAt) || 0,
      };
    });
}

/** 仓位已平（含 changmen 归因或同组卖单已覆盖成本/份额） */
export function pmBuySoldOutForDisplay(buy: OrderRow, groupRows: OrderRow[]): boolean {
  if (!isPolymarketOpenPosition(buy))
    return true;

  const sells = pmBuyLinkedSells(buy, groupRows);
  if (!sells.length)
    return false;

  const buyStake = Number(buy.BetMoney) || 0;
  const soldCost = sells.reduce((sum, s) => sum + pmSellCostCny(s, [buy]), 0);
  if (buyStake > 0 && soldCost >= buyStake - 1)
    return true;

  const fill = Number(buy.PmShares) || 0;
  const soldShares = sells.reduce((sum, s) => sum + (Number(s.PmShares) || 0), 0);
  return fill > 0 && soldShares + 0.05 >= fill;
}

/**
 * PM 买单行盈亏展示：
 * - 默认持有到赛果 → Win/Lose 的 Money
 * - 有卖单且仓位已平 → 仅卖单已实现盈亏（提前结算，忽略误同步的赛果 Money）
 * - 部分卖出仍持仓 → 卖单盈亏 + 剩余部分的赛果 Money
 */
export function pmBuyDisplayProfitCny(buy: OrderRow, groupRows: OrderRow[]): number {
  const sells = pmBuyLinkedSells(buy, groupRows);
  if (!sells.length)
    return Number(buy.Money) || 0;

  const sellProfit = sells.reduce((sum, s) => sum + (Number(s.Money) || 0), 0);
  if (pmBuySoldOutForDisplay(buy, groupRows))
    return sellProfit;

  const marketPart = String(buy.Status ?? "") !== "None" ? (Number(buy.Money) || 0) : 0;
  return sellProfit + marketPart;
}

/** 买单行状态点：已平仓用卖单盈亏着色，否则用赛果 Status */
export function pmBuyDisplayStatus(buy: OrderRow, groupRows: OrderRow[]): OrderRow["Status"] {
  const sells = pmBuyLinkedSells(buy, groupRows);
  if (sells.length && pmBuySoldOutForDisplay(buy, groupRows)) {
    const p = pmBuyDisplayProfitCny(buy, groupRows);
    if (p > 0)
      return "Win";
    if (p < 0)
      return "Lose";
    return "None";
  }
  return buy.Status ?? "None";
}

/** 买单行盈亏展示（卖单绑定在买单上，不单独成行） */
export function pmBuyProfitDisplay(
  buy: OrderRow,
  groupRows: OrderRow[],
): { profitCny: number; pending: boolean; earlySettled: boolean } {
  const sells = pmBuyLinkedSells(buy, groupRows);
  const earlySettled = sells.length > 0 && pmBuySoldOutForDisplay(buy, groupRows);
  if (!sells.length && String(buy.Status ?? "") === "None")
    return { profitCny: 0, pending: true, earlySettled: false };
  return {
    profitCny: pmBuyDisplayProfitCny(buy, groupRows),
    pending: false,
    earlySettled,
  };
}

/** 侧栏列表展示行：PM 卖单仅用于盈亏归因，不单独占一行 */
export function orderListDisplayRows(rows: OrderRow[]): OrderRow[] {
  return rows.filter(r => !(isPolymarketOrderRow(r) && r.PmSide === "sell"));
}

/** 组内盈亏：PM 卖单 = 回款 − 对应买单成本；无卖单的 PM 买单 = 赛果 Money */
export function computeOrderGroupProfit(rows: OrderRow[]): number {
  const trad = rows.filter(r => !isPolymarketOrderRow(r));
  const pmBuys = rows.filter(
    r => isPolymarketOrderRow(r) && r.PmSide !== "sell" && !LOSE_REJECT.has(String(r.Status)),
  );
  const pmSells = rows.filter(r => isPolymarketOrderRow(r) && r.PmSide === "sell");

  let total = trad.reduce((sum, r) => sum + (Number(r.Money) || 0), 0);

  if (pmSells.length) {
    const linkedBuyIds = new Set<string>();
    for (const sell of pmSells) {
      total += (Number(sell.BetMoney) || 0) - pmSellCostCny(sell, pmBuys);
      const buyId = String(sell.PmBuyOrderId ?? "").trim();
      if (buyId)
        linkedBuyIds.add(buyId);
    }
    for (const buy of pmBuys) {
      if (!linkedBuyIds.has(String(buy.OrderID ?? "")))
        total += Number(buy.Money) || 0;
    }
  }
  else {
    total += pmBuys.reduce((sum, r) => sum + (Number(r.Money) || 0), 0);
  }

  return total;
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
