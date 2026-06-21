import type { VenueOrder } from "@platform/contract";
import type { PlatformAccount } from "@/models/platformAccount";
import type { OrderRow, PageResult } from "@/types/esport";
import { post, unwrap } from "@/api/client";

/** [A8 可证实] `Ut.getOrders`：success!==1 时不更新侧栏（返回 null） */
export async function getOrderList(body: Record<string, unknown> = {}) {
  const data = await post<PageResult<OrderRow>>("Client_GetOrderList", body);
  if (data.success !== 1)
    return null;
  return data.info ?? { list: [], total: 0, pageIndex: 1, pageSize: 20 };
}

export async function saveOrder(body: Record<string, unknown>) {
  return unwrap(await post<unknown>("Client_SaveOrder", body));
}

/** 对齐 bundle `Vt.saveOrders`：按 provider 分组调用 `Client_SaveOrder` */
export async function saveOrders(account: PlatformAccount, orders: VenueOrder[]): Promise<void> {
  const byProvider = new Map<string, VenueOrder[]>();
  for (const order of orders) {
    const list = byProvider.get(order.provider) ?? [];
    list.push(order);
    byProvider.set(order.provider, list);
  }
  for (const [type, list] of byProvider) {
    await saveOrder({
      type,
      playerId: account.accountId,
      orders: JSON.stringify(list),
    });
  }
}

/** [A8 可证实] `Vt.saveOrderBind`：空数组不 POST */
export async function saveOrderBind(body: Record<string, unknown>) {
  const raw = body.orders;
  if (typeof raw === "string") {
    try {
      const rows = JSON.parse(raw) as unknown[];
      if (!rows?.length)
        return;
    }
    catch {
      // 非 JSON 时仍交给服务端
    }
  }
  return unwrap(await post<boolean>("Client_SaveOrderBind", body));
}
