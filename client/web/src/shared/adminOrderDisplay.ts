import type { AdminAccountDetail, AdminOrderRow } from "@/types/admin";
import type { OrderRow } from "@/types/order";
import {
  isArbGroup,
  normalizeOrderStatus,
  orderLegendModifier,
  orderLegendText,
  orderStatusClass,
} from "@/shared/orderDisplay";
import {
  groupOrdersByLink,
  orderLinkMapEntries,
} from "@/shared/orderLink";
import { accountOrderDisplayName } from "@/shared/accountDisplayName";

export { isArbGroup, orderLegendText, orderStatusClass };

interface AdminOrderDisplayAccount {
  accountId: number;
  platform?: string;
  provider?: string;
}

function normalizeStatus(raw: string): OrderRow["Status"] {
  return normalizeOrderStatus(raw);
}

export function adminOrderDisplayProvider(
  row: AdminOrderRow,
  accounts: AdminOrderDisplayAccount[] = [],
): string {
  const account = accounts.find(a => Number(a.accountId) === Number(row.playerId));
  return account?.platform || account?.provider || row.provider;
}

export function adminOrderToOrderRow(
  row: AdminOrderRow,
  accounts: AdminOrderDisplayAccount[] = [],
): OrderRow {
  return {
    OrderID: row.orderId,
    Link: row.linkId,
    Type: adminOrderDisplayProvider(row, accounts),
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
  const acc = accounts.find(a => a.accountId === pid);
  if (acc) {
    const platform = acc.platformName || acc.platform || row.Type || "";
    return `${platform} / ${accountOrderDisplayName(acc)}`;
  }
  if (row.Type)
    return String(row.Type);
  return pid ? `#${pid}` : "";
}

export function orderLegendClass(rows: OrderRow[]) {
  return `admin-order-link__legend--${orderLegendModifier(rows)}`;
}

export function groupAdminOrderEntries(
  orders: AdminOrderRow[],
  accounts: AdminOrderDisplayAccount[] = [],
) {
  const map = groupOrdersByLink(orders.map(row => adminOrderToOrderRow(row, accounts)));
  return orderLinkMapEntries(map).map(([link, orderRows]) => {
    const byId = new Map(orders.map(o => [o.orderId, o]));
    const adminRows = orderRows
      .map(r => byId.get(String(r.OrderID ?? "")))
      .filter((r): r is AdminOrderRow => Boolean(r));
    return { link, orderRows, adminRows };
  });
}
