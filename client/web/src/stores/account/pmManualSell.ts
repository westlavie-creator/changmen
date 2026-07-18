/**
 * [changmen 扩展] 订单栏 PM 卖出：对当前买单下 FOK，保存本买卖结果。
 */
import { ElMessage } from "element-plus";
import { shallowRef } from "vue";
import type { VenueOrder } from "@changmen/venue-adapter/contract";
import {
  hasOpenPolymarketPosition,
  resolvePmRemainingShares,
  sellPolymarketBuyPosition,
} from "@changmen/venue-adapter/polymarket";
import { saveOrders } from "@/api/order";
import { groupOrdersByLink } from "@/shared/orderLink";
import { formatPolymarketApiDecimal } from "@/shared/pmOrderDisplay";
import { useAccountStore } from "@/stores/accountStore";
import { useOrderStore } from "@/stores/orderStore";
import type { OrderRow } from "@/types/order";

/** 飞行中 / 确认框中：响应式，供按钮 disabled */
const sellingOrderIds = shallowRef(new Set<string>());
/** 链上已卖、落库失败：禁止再点卖出，避免双卖（session 内跨刷新保留） */
const PERSIST_BLOCK_KEY = "pmManualSell.persistBlocked";
const persistBlockedOrderIds = shallowRef(loadPersistBlocked());

function loadPersistBlocked(): Set<string> {
  try {
    const raw = sessionStorage.getItem(PERSIST_BLOCK_KEY);
    if (!raw)
      return new Set();
    const arr = JSON.parse(raw) as unknown;
    if (!Array.isArray(arr))
      return new Set();
    return new Set(arr.map(x => String(x ?? "").trim()).filter(Boolean));
  }
  catch {
    return new Set();
  }
}

function writePersistBlocked(ids: Set<string>): void {
  try {
    sessionStorage.setItem(PERSIST_BLOCK_KEY, JSON.stringify([...ids]));
  }
  catch { /* ignore quota */ }
}

function setHas(refSet: typeof sellingOrderIds, id: string): boolean {
  return refSet.value.has(id);
}

function addId(refSet: typeof sellingOrderIds, id: string): void {
  if (refSet.value.has(id))
    return;
  const next = new Set(refSet.value);
  next.add(id);
  refSet.value = next;
  if (refSet === persistBlockedOrderIds)
    writePersistBlocked(next);
}

function removeId(refSet: typeof sellingOrderIds, id: string): void {
  if (!refSet.value.has(id))
    return;
  const next = new Set(refSet.value);
  next.delete(id);
  refSet.value = next;
  if (refSet === persistBlockedOrderIds)
    writePersistBlocked(next);
}

function venueOrdersToLocalRows(buyRow: OrderRow, orders: VenueOrder[]): OrderRow[] {
  const playerId = Number(buyRow.PlayerID) || 0;
  const link = Number(buyRow.Link) || Number(orders.find(o => o.link)?.link) || 0;
  return orders.map((vo) => {
    if (vo.pmSide === "sell") {
      return {
        OrderID: vo.orderId,
        Link: vo.link ?? link,
        Type: "Polymarket",
        Match: vo.match,
        Bet: vo.bet,
        Item: vo.item,
        Odds: vo.odds,
        BetMoney: vo.betMoney,
        Money: vo.money,
        Status: "None",
        CreateAt: vo.createAt,
        PlayerID: playerId,
        PmTokenId: vo.pmTokenId,
        PmShares: vo.pmShares,
        PmFillPrice: vo.pmFillPrice,
        PmStakeUsdc: vo.pmStakeUsdc,
        PmConditionId: vo.pmConditionId,
        PmOrigin: vo.pmOrigin,
        PmRealizedPnlUsdc: vo.pmRealizedPnlUsdc,
        PmSide: "sell",
        PmBuyOrderId: vo.pmBuyOrderId ?? String(buyRow.OrderID ?? ""),
      } satisfies OrderRow;
    }
    return {
      ...buyRow,
      Money: vo.money,
      PmStakeUsdc: vo.pmStakeUsdc,
      PmAttributedSellShares: vo.pmAttributedSellShares,
      PmSellState: vo.pmSellState,
      PmSide: "buy",
      PmOrigin: vo.pmOrigin ?? buyRow.PmOrigin,
    } satisfies OrderRow;
  });
}

/** 落库失败时先改本地，避免按钮仍可卖 */
function applyManualSellOrdersLocally(buyRow: OrderRow, ordersToSave: VenueOrder[]): void {
  const orderStore = useOrderStore();
  const byId = new Map<string, OrderRow>();
  for (const rows of orderStore.orders.values()) {
    for (const row of rows)
      byId.set(String(row.OrderID ?? ""), row);
  }
  for (const local of venueOrdersToLocalRows(buyRow, ordersToSave)) {
    const id = String(local.OrderID ?? "").trim();
    if (!id)
      continue;
    byId.set(id, local);
  }
  orderStore.orders = groupOrdersByLink([...byId.values()]);
}

export function canManualSellPmBuy(row: OrderRow): boolean {
  const orderId = String(row.OrderID ?? "").trim();
  if (!orderId)
    return false;
  if (setHas(persistBlockedOrderIds, orderId))
    return false;
  if (String(row.Type ?? "").trim() !== "Polymarket")
    return false;
  if (row.PmSide === "sell")
    return false;
  if (!String(row.PmTokenId ?? "").trim())
    return false;
  if (resolvePmRemainingShares(row) <= 0.0001)
    return false;
  return hasOpenPolymarketPosition(row);
}

export function isPmManualSellInFlight(orderId: string | number | undefined): boolean {
  return setHas(sellingOrderIds, String(orderId ?? "").trim());
}

export async function confirmAndSellPmBuyOrder(row: OrderRow): Promise<boolean> {
  const orderId = String(row.OrderID ?? "").trim();
  if (!orderId || !canManualSellPmBuy(row))
    return false;
  if (setHas(sellingOrderIds, orderId))
    return false;

  // 确认框前加锁，避免连点弹出多个确认
  addId(sellingOrderIds, orderId);
  try {
    const shares = resolvePmRemainingShares(row);
    const sharesText = formatPolymarketApiDecimal(shares);
    const { ElMessageBox } = await import("element-plus");
    try {
      await ElMessageBox.confirm(
        `市价全卖该买单对应份额 ${sharesText}？`,
        "PM 卖出",
        { type: "warning", confirmButtonText: "卖出", cancelButtonText: "取消" },
      );
    }
    catch {
      return false;
    }

    const accountStore = useAccountStore();
    const account = accountStore.findAccount(Number(row.PlayerID));
    if (!account?.token) {
      ElMessage.error("找不到对应 Polymarket 账号");
      return false;
    }

    const result = await sellPolymarketBuyPosition({
      account,
      buyRow: row,
    });
    if (!result.ok) {
      if (result.chainSubmitted || result.sellOrderId) {
        addId(persistBlockedOrderIds, orderId);
        ElMessage.error(
          `${result.error ?? "卖出失败"}（链上可能已成交，已禁止再次卖出，请刷新核对）`,
        );
      }
      else {
        ElMessage.error(result.error ?? "卖出失败");
      }
      return false;
    }
    if (result.ordersToSave?.length) {
      try {
        await saveOrders(account, result.ordersToSave);
      }
      catch (saveErr) {
        try {
          await saveOrders(account, result.ordersToSave);
        }
        catch {
          applyManualSellOrdersLocally(row, result.ordersToSave);
          addId(persistBlockedOrderIds, orderId);
          ElMessage.error(
            `链上已卖出，但订单落库失败：${saveErr instanceof Error ? saveErr.message : String(saveErr)}。已禁止再次卖出，请刷新核对。`,
          );
          try {
            await useOrderStore().fetchOrders();
          }
          catch { /* ignore */ }
          return false;
        }
      }
      removeId(persistBlockedOrderIds, orderId);
    }
    await useOrderStore().fetchOrders();
    if (result.partialFill) {
      ElMessage.warning(
        `仅成交 ${formatPolymarketApiDecimal(result.sharesSold ?? shares)} / ${sharesText} 份（已写入）`,
      );
    }
    else {
      ElMessage.success(
        `已卖出 ${formatPolymarketApiDecimal(result.sharesSold ?? shares)} 份`,
      );
    }
    return true;
  }
  catch (err) {
    ElMessage.error(err instanceof Error ? err.message : String(err));
    return false;
  }
  finally {
    removeId(sellingOrderIds, orderId);
  }
}
