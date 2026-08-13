import type { PolymarketOrderRow } from "./orderTypes";

/** User WS 帧里与本订单相关的 order id（taker / maker / order 自身） */
export function polymarketUserOrderIdsFromMessage(msg: Record<string, unknown>): string[] {
  const ids: string[] = [];
  const push = (value: unknown) => {
    const id = String(value ?? "").trim();
    if (id)
      ids.push(id);
  };
  push(msg.taker_order_id);
  push(msg.id);
  const makerOrders = msg.maker_orders;
  if (Array.isArray(makerOrders)) {
    for (const row of makerOrders) {
      if (row && typeof row === "object")
        push((row as { order_id?: unknown }).order_id);
    }
  }
  return ids;
}

function messageRelatesToOrder(msg: Record<string, unknown>, watchOrderId: string): boolean {
  const target = watchOrderId.trim().toLowerCase();
  if (!target)
    return false;
  return polymarketUserOrderIdsFromMessage(msg).some(id => id.toLowerCase() === target);
}

/**
 * 解读 User Channel 单帧对指定 orderId 的终态。
 * 对齐官方 Real-Time Order Updates：
 * - Placement = 受理（含 delayed），非终态
 * - Update = 部分/全部成交（须 size_matched>0）
 * - Cancellation / status CANCELED = 剩余量取消 → unfilled
 * - unmatched 官方= delay 后挂簿成功，**不是** FOK 杀单
 */
export function interpretPolymarketUserWsMessage(
  raw: unknown,
  watchOrderId: string,
): "matched" | "unfilled" | null {
  if (!raw || typeof raw !== "object")
    return null;
  const msg = raw as Record<string, unknown>;
  if (!messageRelatesToOrder(msg, watchOrderId))
    return null;

  const eventType = String(msg.event_type ?? "").trim().toLowerCase();
  const type = String(msg.type ?? "").trim().toUpperCase();
  const orderStatus = String(msg.status ?? "").trim().toLowerCase();

  if (eventType === "order" || type === "PLACEMENT" || type === "UPDATE" || type === "CANCELLATION") {
    if (type === "CANCELLATION" || orderStatus === "canceled" || orderStatus === "cancelled")
      return "unfilled";
    const sizeMatched = Number(msg.size_matched);
    if (type === "UPDATE" && Number.isFinite(sizeMatched) && sizeMatched > 0)
      return "matched";
    // PLACEMENT / DELAYED / LIVE / UNMATCHED：继续等 trade 或 Cancellation
    return null;
  }

  if (eventType === "trade" || type === "TRADE") {
    const status = String(msg.status ?? "").trim().toUpperCase();
    if (status === "FAILED" || status === "TRADE_STATUS_FAILED")
      return "unfilled";
    if (
      status === "MATCHED"
      || status === "MINED"
      || status === "CONFIRMED"
      || status === "TRADE_STATUS_MATCHED"
      || status === "TRADE_STATUS_MATCHED_NOT_BROADCASTED"
      || status === "TRADE_STATUS_MINED"
      || status === "TRADE_STATUS_CONFIRMED"
    ) {
      return "matched";
    }
  }
  return null;
}

export function polymarketOrderRowFromUserWsMessage(
  msg: Record<string, unknown>,
  outcome: "matched" | "unfilled",
): PolymarketOrderRow {
  if (outcome === "unfilled")
    return { status: "cancelled", size_matched: "0" };
  const size = msg.size ?? msg.size_matched;
  return {
    status: String(msg.status ?? "MATCHED"),
    size_matched: String(size ?? ""),
    associate_trades: msg.id ? [String(msg.id)] : undefined,
  };
}
