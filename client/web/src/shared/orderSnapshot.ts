import type { OrderRow } from "@/types/order";

/** 影响侧栏展示与 updateTodayProfit 的字段 */
function orderRowSnapshot(row: OrderRow) {
  return {
    OrderID: row.OrderID ?? "",
    Link: Number(row.Link) || 0,
    Type: row.Type ?? "",
    Match: row.Match ?? "",
    Bet: row.Bet ?? "",
    Item: row.Item ?? "",
    Odds: Number(row.Odds) || 0,
    BetMoney: Number(row.BetMoney) || 0,
    Money: Number(row.Money) || 0,
    Status: row.Status ?? "",
    CreateAt: Number(row.CreateAt) || 0,
    PlayerID: Number(row.PlayerID) || 0,
    PlayerPlatform: row.Player?.Platform ?? "",
    PlayerUserName: row.Player?.UserName ?? "",
  };
}

function sortOrdersForSnapshot(list: OrderRow[]): OrderRow[] {
  return [...list].sort((a, b) => {
    const aLink = Math.abs(Number(a.Link) || 0);
    const bLink = Math.abs(Number(b.Link) || 0);
    if (aLink !== bLink)
      return bLink - aLink;
    return String(a.OrderID ?? "").localeCompare(String(b.OrderID ?? ""));
  });
}

/** 稳定序列化：顺序无关的列表内容指纹 */
export function buildOrderListSnapshot(list: OrderRow[]): string {
  return JSON.stringify(sortOrdersForSnapshot(list).map(orderRowSnapshot));
}

export function flattenOrderMap(map: Map<number, OrderRow[]>): OrderRow[] {
  const out: OrderRow[] = [];
  for (const rows of map.values())
    out.push(...rows);
  return out;
}

export function sameOrderList(a: OrderRow[], b: OrderRow[]): boolean {
  if (a.length !== b.length)
    return false;
  return buildOrderListSnapshot(a) === buildOrderListSnapshot(b);
}
