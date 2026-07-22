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
  alignPredictionSellLinksToBuys,
  countPrimaryOrderRows,
  groupOrdersByLink,
  isPredictionSellRow,
  orderLinkMapEntries,
} from "@/shared/orderLink";
import { accountOrderDisplayName } from "@/shared/accountDisplayName";

export { isArbGroup, orderLegendText, orderStatusClass };

/** 管理端订单笔数：排除 PM/PF 卖单（与侧栏 countPrimaryOrderRows 同口径） */
export function countAdminPrimaryOrders(
  orders: AdminOrderRow[],
  accounts: AdminAccountDetail[] = [],
): number {
  return countPrimaryOrderRows(orders.map(row => adminOrderToOrderRow(row, accounts)));
}

export function isAdminPredictionSellOrder(
  row: AdminOrderRow,
  accounts: AdminAccountDetail[] = [],
): boolean {
  return isPredictionSellRow(adminOrderToOrderRow(row, accounts));
}

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
  // Polymarket / PredictFun 必须 Type 固定，否则 OrderList 不进专用模板
  const provider = String(row.provider || "").trim();
  const type = provider === "Polymarket" || provider === "PredictFun"
    ? provider
    : adminOrderDisplayProvider(row, accounts);
  return {
    OrderID: row.orderId,
    Link: row.linkId,
    Type: type,
    Match: row.match,
    Bet: row.bet,
    Item: row.item,
    Odds: row.odds,
    BetMoney: row.betMoney,
    Money: row.money,
    Status: normalizeStatus(row.status),
    CreateAt: row.createAt,
    PlayerID: row.playerId,
    PmTokenId: row.pmTokenId,
    PmShares: row.pmShares,
    PmFillPrice: row.pmFillPrice,
    PmStakeUsdc: row.pmStakeUsdc,
    PmConditionId: row.pmConditionId,
    PmOrigin: row.pmOrigin,
    PmAttributedSellShares: row.pmAttributedSellShares,
    PmRealizedPnlUsdc: row.pmRealizedPnlUsdc,
    PmSellProceeds: row.pmSellProceeds,
    PmLastSellOrderId: row.pmLastSellOrderId,
    PmSellState: row.pmSellState,
    PmSide: row.pmSide,
    PmBuyOrderId: row.pmBuyOrderId,
    PfSide: row.pfSide,
    PfBuyOrderId: row.pfBuyOrderId,
    PfSellState: row.pfSellState,
    PfShares: row.pfShares,
    PfHoldShares: row.pfHoldShares,
    PfNotionalUsdt: row.pfNotionalUsdt,
    PfFillCostUsdt: row.pfFillCostUsdt,
    PfBookPrice: row.pfBookPrice,
    PfTokenId: row.pfTokenId,
    PfMarketId: row.pfMarketId,
    PfSellOrderId: row.pfSellOrderId,
    PfSellProceeds: row.pfSellProceeds,
    PfFeeAmountWei: row.pfFeeAmountWei,
    PfFeeType: row.pfFeeType,
    PfFeeUsdt: row.pfFeeUsdt,
    PfFeeRateBps: row.pfFeeRateBps,
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
  // 卖单 Link 对齐到父买单，再分组，否则软附属跨不了 fieldset
  const map = groupOrdersByLink(
    alignPredictionSellLinksToBuys(orders.map(row => adminOrderToOrderRow(row, accounts))),
  );
  return orderLinkMapEntries(map).map(([link, orderRows]) => {
    const byId = new Map(orders.map(o => [o.orderId, o]));
    const adminRows = orderRows
      .map(r => byId.get(String(r.OrderID ?? "")))
      .filter((r): r is AdminOrderRow => Boolean(r));
    return { link, orderRows, adminRows };
  });
}
