import type { VenueOrder } from "@changmen/venue-adapter/contract";
import type { PlatformAccount } from "@/models/platformAccount";
import { sortVenueOrdersNewestFirst } from "@changmen/venue-adapter/contract";
import { hasOpenPolymarketPosition } from "@changmen/venue-adapter/polymarket";
import { Currency, getExchange } from "@changmen/shared/currency";
import { saveOrders } from "@/api/order";
import { getProvider } from "@/runtime/providers";
function isOpenUnsettledVenueOrder(o: VenueOrder): boolean {
  if (o.status !== "none")
    return false;
  if (o.provider === "Polymarket")
    return hasOpenPolymarketPosition(o);
  if (o.provider === "PredictFun") {
    if (o.pfSide === "sell" || o.pfSellState === "closed" || o.pfSellState === "settled")
      return false;
  }
  return true;
}

/** PM 未结敞口：剩余成本 pmStakeUsdc×汇率×赔率；勿用原始 betMoney（满仓） */
function unsettledExposureCny(o: VenueOrder): number {
  const odds = Number(o.odds) || 0;
  if (o.provider === "Polymarket" && o.pmSide !== "sell") {
    const stakeUsdc = Number(o.pmStakeUsdc) || 0;
    if (stakeUsdc > 0)
      return stakeUsdc * getExchange(Currency.USDT) * odds;
    return 0;
  }
  return odds * (Number(o.betMoney) || 0);
}

export function applyUnsettledStats(account: PlatformAccount, orders: VenueOrder[]) {
  const open = orders.filter(isOpenUnsettledVenueOrder);
  account.unsettle = open.length;
  const unsettledExposure = open.reduce((sum, o) => sum + unsettledExposureCny(o), 0);
  account.winBalance = (account.balance ?? 0) + unsettledExposure;
}

/** [changmen 扩展] 拉单入库时附带最终套利 Link，缩短占位窗口（见 docs/ARB_LINK_ID.md） */
export interface SyncVenueOrdersOpts {
  pendingBindLinkId?: number;
  pendingBindOrderId?: string;
}

function stampPendingBindLink(orders: VenueOrder[], opts?: SyncVenueOrdersOpts): void {
  const linkId = Number(opts?.pendingBindLinkId);
  if (!Number.isFinite(linkId) || linkId === 0)
    return;
  const targetId = String(opts?.pendingBindOrderId ?? "").trim();
  if (targetId) {
    const hit = orders.find(o => String(o.orderId ?? "").trim() === targetId);
    if (hit)
      hit.link = linkId;
    return;
  }
  // 无明确 orderId 时只标最新一条（与 A8 绑 orders[0] 一致）
  if (orders[0])
    orders[0].link = linkId;
}

/** 对齐 A8 `uv.updateOrders` + `Vt.saveOrders`（全场馆统一 provider.getOrders） */
export async function syncVenueOrders(
  account: PlatformAccount,
  opts?: SyncVenueOrdersOpts,
): Promise<VenueOrder[] | undefined> {
  const provider = getProvider(account);
  if (!provider?.getOrders)
    return undefined;
  const raw = await provider.getOrders(account);
  if (raw == null)
    return undefined;
  const orders = sortVenueOrdersNewestFirst(raw);
  stampPendingBindLink(orders, opts);
  applyUnsettledStats(account, orders);
  await saveOrders(account, orders);
  return orders;
}

/** 对齐 A8 `uv.updateOrders`：拉场馆订单并返回（拒单检测用） */
export async function updateVenueOrders(
  account: PlatformAccount,
  opts?: SyncVenueOrdersOpts,
): Promise<VenueOrder[] | undefined> {
  account.loadingBalance = true;
  try {
    return await syncVenueOrders(account, opts);
  }
  catch (err) {
    console.error(`[${account.provider}]${account.playerName} 加载订单出错`, err);
    return undefined;
  }
  finally {
    account.loadingBalance = false;
  }
}
