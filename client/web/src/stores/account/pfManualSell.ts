/**
 * [changmen 扩展] 订单栏 PF 卖出：1:1 全卖指定买单（house 代卖）
 */
import { ElMessage } from "element-plus";
import { shallowRef } from "vue";
import type { OrderRow } from "@/types/order";
import { pfSubmitSell } from "@changmen/venue-adapter/predictfun";
import { useAccountStore } from "@/stores/accountStore";
import { useOrderStore } from "@/stores/orderStore";

const sellingOrderIds = shallowRef(new Set<string>());

function setHas(refSet: typeof sellingOrderIds, id: string): boolean {
  return refSet.value.has(id);
}

function addId(refSet: typeof sellingOrderIds, id: string): void {
  const next = new Set(refSet.value);
  next.add(id);
  refSet.value = next;
}

function removeId(refSet: typeof sellingOrderIds, id: string): void {
  const next = new Set(refSet.value);
  next.delete(id);
  refSet.value = next;
}

export function canManualSellPfBuy(row: OrderRow): boolean {
  const orderId = String(row.OrderID ?? "").trim();
  if (!orderId)
    return false;
  if (String(row.Type ?? "").trim() !== "PredictFun")
    return false;
  if (row.PfSide === "sell")
    return false;
  if (row.PfSellState === "closed")
    return false;
  const st = String(row.Status ?? "None");
  if (st !== "None")
    return false;
  return true;
}

export function isPfManualSellInFlight(orderId: string | number | undefined): boolean {
  return setHas(sellingOrderIds, String(orderId ?? "").trim());
}

export async function confirmAndSellPfBuyOrder(row: OrderRow): Promise<boolean> {
  const orderId = String(row.OrderID ?? "").trim();
  if (!orderId || !canManualSellPfBuy(row))
    return false;
  if (setHas(sellingOrderIds, orderId))
    return false;

  addId(sellingOrderIds, orderId);
  try {
    const { ElMessageBox } = await import("element-plus");
    try {
      await ElMessageBox.confirm(
        "市价全卖该买单对应份额？",
        "PredictFun 卖出",
        { type: "warning", confirmButtonText: "卖出", cancelButtonText: "取消" },
      );
    }
    catch {
      return false;
    }

    const accountStore = useAccountStore();
    const account = accountStore.findAccount(Number(row.PlayerID));
    if (!account?.accountId) {
      ElMessage.error("找不到对应 PredictFun 账号");
      return false;
    }

    const result = await pfSubmitSell(account, orderId);
    await useOrderStore().fetchOrders();
    try {
      await accountStore.refreshBalance(account);
    }
    catch {
      /* ignore */
    }
    ElMessage.success(
      `已卖出，回款 ${Number(result.proceedsUsdt ?? 0).toFixed(2)} USDT`,
    );
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
