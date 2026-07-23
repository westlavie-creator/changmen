/** [changmen 扩展] P0/P1 共用：防止并发双卖同一买单 */
const sellingOrderIds = new Set<string>();

export function isArbAutoSellInFlight(orderId: string): boolean {
  return sellingOrderIds.has(String(orderId ?? "").trim());
}

/** @returns false 表示已有飞行中卖出 */
export function beginArbAutoSell(orderId: string): boolean {
  const id = String(orderId ?? "").trim();
  if (!id || sellingOrderIds.has(id))
    return false;
  sellingOrderIds.add(id);
  return true;
}

export function endArbAutoSell(orderId: string): void {
  sellingOrderIds.delete(String(orderId ?? "").trim());
}
