import type { OrderRow } from "@/types/order";
import { isPmBuyOrderListRow, isPmSellOrderListRow } from "@/shared/pmOrderDisplay";
import { isPfBuyOrderListRow, isPfSellOrderListRow } from "@/shared/pfOrderDisplay";

/** 买单上已记入的仓位卖出事件数 */
export function positionSellEventCount(row: OrderRow): number {
  const sells = row.PositionEvents?.sells;
  return Array.isArray(sells) ? sells.length : 0;
}

/** 买单：有双写事件时显示「仓位」（仅 PM/PF 买单；条数无观察价值） */
export function buyPositionEventTagText(row: OrderRow): string | null {
  if (!isPmBuyOrderListRow(row) && !isPfBuyOrderListRow(row))
    return null;
  return positionSellEventCount(row) > 0 ? "仓位" : null;
}

function orderIdKey(id: unknown): string {
  return String(id ?? "").trim().toLowerCase();
}

function buyIdOfSell(sell: OrderRow): string {
  if (isPmSellOrderListRow(sell))
    return orderIdKey(sell.PmBuyOrderId);
  if (isPfSellOrderListRow(sell))
    return orderIdKey(sell.PfBuyOrderId);
  return "";
}

function findBuyForSell(sell: OrderRow, peers: ReadonlyArray<OrderRow>): OrderRow | undefined {
  const buyId = buyIdOfSell(sell);
  if (!buyId)
    return undefined;
  return peers.find(r => orderIdKey(r.OrderID) === buyId);
}

function sellIdInBuyEvents(buy: OrderRow, sellId: string): boolean {
  const sells = buy.PositionEvents?.sells;
  if (!Array.isArray(sells) || !sellId)
    return false;
  return sells.some(e => orderIdKey(e?.id) === sellId);
}

/**
 * 卖单：
 * - 已在买单 positionEvents 里 →「已记入」
 * - 买单已有其它事件但本单缺失 →「缺事件」（双写时代信号）
 * - 旧单（买单无任何 positionEvents）静默，避免 lastSell 历史字段误报
 */
export function sellPositionEventTagText(
  sell: OrderRow,
  peers: ReadonlyArray<OrderRow>,
): string | null {
  if (!isPmSellOrderListRow(sell) && !isPfSellOrderListRow(sell))
    return null;
  const buy = findBuyForSell(sell, peers);
  if (!buy)
    return null;
  const sellId = orderIdKey(sell.OrderID);
  if (!sellId)
    return null;
  if (sellIdInBuyEvents(buy, sellId))
    return "已记入";
  // 仅当买单已进入双写（至少有一条事件）才报缺；勿用 lastSell（部署前就有）
  return positionSellEventCount(buy) > 0 ? "缺事件" : null;
}

/** 统一入口：买单「仓位·N」（附属卖出来源标由 OrderList sellSource 负责） */
export function positionEventObserveTagText(
  row: OrderRow,
  peers: ReadonlyArray<OrderRow>,
): string | null {
  void peers;
  return buyPositionEventTagText(row);
}

export function positionEventObserveTagClass(tag: string | null): string {
  if (tag === "已记入" || tag === "仓位" || (tag != null && tag.startsWith("仓位")))
    return "order__pm-tag--pe-ok";
  if (tag === "缺事件")
    return "order__pm-tag--pe-miss";
  return "";
}

export type PositionEventObserveTag = {
  text: string;
  className: string;
  title: string;
};

/** 一次算出文案/样式/悬停说明，避免模板重复求值 */
export function positionEventObserveTag(
  row: OrderRow,
  peers: ReadonlyArray<OrderRow>,
): PositionEventObserveTag | null {
  const text = positionEventObserveTagText(row, peers);
  if (!text)
    return null;
  const title = text === "缺事件"
    ? "卖单未写入买单 positionEvents（双写缺失）"
    : text === "仓位" || text.startsWith("仓位")
      ? "买单已记入仓位卖出事件"
      : "卖单已记入买单 positionEvents";
  return {
    text,
    className: positionEventObserveTagClass(text),
    title,
  };
}
