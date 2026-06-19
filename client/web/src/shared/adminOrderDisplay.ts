import type { AdminAccountDetail, AdminOrderRow } from "@/types/admin";
import type { OrderRow } from "@/types/order";
import {
  groupOrdersByLink,
  isLinkedArbOrderGroup,
  orderLinkLegend,
  orderLinkMapEntries,
} from "@/shared/orderLink";

function normalizeStatus(raw: string): OrderRow["Status"] {
  const s = String(raw || "None");
  if (s === "win" || s === "Win") return "Win";
  if (s === "lose" || s === "Lose") return "Lose";
  if (s === "reject" || s === "Reject") return "Reject";
  if (s === "return" || s === "Return") return "Return";
  if (s === "pending" || s === "Pending") return "Pending";
  if (s === "none" || s === "None") return "None";
  return s;
}

export function adminOrderToOrderRow(row: AdminOrderRow): OrderRow {
  return {
    OrderID: row.orderId,
    Link: row.linkId,
    Type: row.provider,
    Match: row.match,
    Bet: row.bet,
    Item: row.item,
    Odds: row.odds,
    BetMoney: row.betMoney,
    Money: row.money,
    Status: normalizeStatus(row.status),
    CreateAt: row.createAt,
    PlayerID: row.playerId,
  };
}

export function adminPlayerLabel(row: OrderRow, accounts: AdminAccountDetail[]): string {
  const pid = Number(row.PlayerID) || 0;
  const acc = accounts.find((a) => a.accountId === pid);
  if (acc) {
    const platform = acc.platformName || acc.platform || row.Type || "";
    return `${platform} / ${acc.playerName}`;
  }
  if (row.Type) return String(row.Type);
  return pid ? `#${pid}` : "—";
}

export function groupAdminOrderEntries(orders: AdminOrderRow[]) {
  const map = groupOrdersByLink(orders.map(adminOrderToOrderRow));
  return orderLinkMapEntries(map).map(([link, orderRows]) => {
    const byId = new Map(orders.map((o) => [o.orderId, o]));
    const adminRows = orderRows
      .map((r) => byId.get(String(r.OrderID ?? "")))
      .filter((r): r is AdminOrderRow => Boolean(r));
    return { link, orderRows, adminRows };
  });
}

export function orderLegendText(rows: OrderRow[]) {
  return orderLinkLegend(rows);
}

export function orderLegendClass(rows: OrderRow[]) {
  const total = rows.reduce((sum, r) => sum + (Number(r.Money) || 0), 0);
  if (total === 0) return "default";
  return total > 0 ? "success" : "fail";
}

export function isArbGroup(rows: OrderRow[]) {
  return isLinkedArbOrderGroup(rows);
}
