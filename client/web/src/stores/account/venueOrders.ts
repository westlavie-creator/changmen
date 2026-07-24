import type { VenueOrder } from "@changmen/venue-adapter/contract";
import type { PlatformAccount } from "@/models/platformAccount";
import { sortVenueOrdersNewestFirst } from "@changmen/venue-adapter/contract";
import { hasOpenPolymarketPosition, resolvePmRemainingShares } from "@changmen/venue-adapter/polymarket";
import { wait } from "@changmen/client-core/shared/wait";
import { Currency, getExchange } from "@changmen/shared/currency";
import { truncateShareUsdtAmount } from "@/shared/pfOrderDisplay";
import { saveOrders } from "@/api/order";
import { getProvider } from "@/runtime/providers";

/** PM 下单后等 CLOB trades 索引：最多尝试次数 / 间隔 */
const WAIT_FOR_ORDER_ATTEMPTS_DEFAULT = 5;
const WAIT_FOR_ORDER_GAP_MS_DEFAULT = 500;

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

/** 未结敞口 CNY：PM/PF 用份额×$1×汇率；其它场馆仍 bet×odds */
function unsettledExposureCny(o: VenueOrder): number {
  const fx = getExchange(Currency.USDT);
  if (o.provider === "Polymarket" && o.pmSide !== "sell") {
    const rem = resolvePmRemainingShares(o);
    if (rem > 0.0001)
      return rem * fx;
    const fill = Number(o.pmShares) || 0;
    if (fill > 0.0001)
      return fill * fx;
    const stakeUsdc = Number(o.pmStakeUsdc) || 0;
    const price = Number(o.pmFillPrice);
    if (stakeUsdc > 0 && price > 0 && price < 1)
      return (stakeUsdc / price) * fx;
    return 0;
  }
  if (o.provider === "PredictFun" && o.pfSide !== "sell") {
    const hold = Number(o.pfHoldShares) || 0;
    const fill = Number(o.pfShares) || 0;
    const shares = hold > 0 ? hold : fill;
    if (shares > 0)
      return truncateShareUsdtAmount(shares) * fx;
    const notional = Number(o.pfNotionalUsdt) || Number(o.betMoney) || 0;
    const book = Number(o.pfBookPrice);
    if (notional > 0 && book > 0 && book < 1)
      return truncateShareUsdtAmount(notional / book) * fx;
    return 0;
  }
  const odds = Number(o.odds) || 0;
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
  /**
   * [changmen 扩展] 下单后等待 getOrders 出现该 orderId 再 save。
   * 缓解 PM getPlayerOrder 变快后、CLOB trades 尚未索引导致首轮漏单。
   */
  waitForOrderId?: string;
  waitForOrderAttempts?: number;
  waitForOrderGapMs?: number;
}

function ordersIncludeId(orders: VenueOrder[], orderId: string): boolean {
  const id = String(orderId ?? "").trim();
  if (!id)
    return true;
  return orders.some(o => String(o.orderId ?? "").trim() === id);
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

/**
 * 对齐 A8 `uv.updateOrders` + `Vt.saveOrders`（全场馆统一 provider.getOrders）。
 * [changmen 扩展] PredictFun：只拉单更新本地统计，不 Client_SaveOrder（RDS 仅 Pf_* 写）。
 * [changmen 扩展] waitForOrderId：可重试 getOrders，只在最终结果上 save 一次。
 */
export async function syncVenueOrders(
  account: PlatformAccount,
  opts?: SyncVenueOrdersOpts,
): Promise<VenueOrder[] | undefined> {
  const provider = getProvider(account);
  if (!provider?.getOrders)
    return undefined;

  const waitId = String(opts?.waitForOrderId ?? "").trim();
  const attempts = waitId
    ? Math.max(1, Number(opts?.waitForOrderAttempts) || WAIT_FOR_ORDER_ATTEMPTS_DEFAULT)
    : 1;
  const gapMs = Math.max(0, Number(opts?.waitForOrderGapMs) || WAIT_FOR_ORDER_GAP_MS_DEFAULT);

  let orders: VenueOrder[] | undefined;
  for (let attempt = 1; attempt <= attempts; attempt++) {
    const raw = await provider.getOrders(account);
    if (raw == null) {
      // 保留上一轮成功结果；首轮失败则整体失败
      if (orders)
        break;
      return undefined;
    }
    orders = sortVenueOrdersNewestFirst(raw);
    if (!waitId || ordersIncludeId(orders, waitId))
      break;
    if (attempt < attempts)
      await wait(gapMs);
  }
  if (!orders)
    return undefined;

  stampPendingBindLink(orders, opts);
  applyUnsettledStats(account, orders);
  if (String(account.provider ?? "").trim() !== "PredictFun")
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
