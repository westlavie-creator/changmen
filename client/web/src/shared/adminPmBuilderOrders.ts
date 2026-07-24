import type { PolymarketChangmenOrderRow } from "@/api/admin";

export type CmBuilderDisplayEntry = {
  key: string;
  primary: PolymarketChangmenOrderRow;
  sells: PolymarketChangmenOrderRow[];
  /** orphan-sell：时段内找不到父买单的卖单，仍顶层展示 */
  kind: "buy" | "orphan-sell";
};

function orderIdKey(id: unknown): string {
  return String(id ?? "").trim().toLowerCase();
}

function isSell(row: PolymarketChangmenOrderRow): boolean {
  return String(row.pmSide || "").trim().toLowerCase() === "sell";
}

/**
 * Poly Builder「changmen Polymarket 订单」：买单为主行，卖单挂接合并。
 * 关联：卖单 pmBuyOrderId → 买单；或买单 pmLastSellOrderId → 卖单。
 */
export function groupChangmenPmOrdersForDisplay(
  orders: PolymarketChangmenOrderRow[],
): CmBuilderDisplayEntry[] {
  const buys = orders.filter(r => !isSell(r));
  const sells = orders.filter(isSell);
  const buyById = new Map<string, PolymarketChangmenOrderRow>();
  for (const b of buys) {
    const id = orderIdKey(b.orderId);
    if (id)
      buyById.set(id, b);
  }

  const sellsByBuyId = new Map<string, PolymarketChangmenOrderRow[]>();
  const attachedSellIds = new Set<string>();

  function attach(buyId: string, sell: PolymarketChangmenOrderRow) {
    const key = orderIdKey(buyId);
    if (!key || !buyById.has(key))
      return false;
    const sid = orderIdKey(sell.orderId);
    if (!sid || attachedSellIds.has(sid))
      return true;
    const list = sellsByBuyId.get(key) || [];
    list.push(sell);
    sellsByBuyId.set(key, list);
    attachedSellIds.add(sid);
    return true;
  }

  for (const sell of sells) {
    if (attach(sell.pmBuyOrderId || "", sell))
      continue;
    // 买单上记了最近卖单 id 时反向挂接
    const sellId = orderIdKey(sell.orderId);
    if (!sellId)
      continue;
    for (const buy of buys) {
      if (orderIdKey(buy.pmLastSellOrderId) === sellId) {
        attach(buy.orderId, sell);
        break;
      }
    }
  }

  const entries: CmBuilderDisplayEntry[] = buys.map((buy) => {
    const sellsForBuy = [...(sellsByBuyId.get(orderIdKey(buy.orderId)) || [])]
      .sort((a, b) => (Number(a.createAt) || 0) - (Number(b.createAt) || 0));
    return {
      key: `buy:${buy.orderId}`,
      primary: buy,
      sells: sellsForBuy,
      kind: "buy" as const,
    };
  });

  for (const sell of sells) {
    if (attachedSellIds.has(orderIdKey(sell.orderId)))
      continue;
    entries.push({
      key: `sell:${sell.orderId}`,
      primary: sell,
      sells: [],
      kind: "orphan-sell",
    });
  }

  entries.sort((a, b) => (Number(b.primary.createAt) || 0) - (Number(a.primary.createAt) || 0));
  return entries;
}

/** 表格「方向」列：买单生命周期 / 孤儿卖单 */
export function cmBuilderSideLabel(entry: CmBuilderDisplayEntry): string {
  if (entry.kind === "orphan-sell")
    return "SELL";
  const state = String(entry.primary.pmSellState || "").trim().toLowerCase();
  if (entry.sells.length > 0 || state === "closed")
    return "BUY·已卖出";
  if (state === "partial")
    return "BUY·部分卖出";
  if (state === "settled")
    return "BUY·已结算";
  return "BUY";
}
