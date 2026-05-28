import { post, unwrap } from "@/api/client";
import type { OrderRow, PageResult } from "@/types/esport";

export async function getOrderList(body: Record<string, unknown> = {}) {
  const data = await post<PageResult<OrderRow>>("Client_GetOrderList", body);
  if (data.success !== 1) return { list: [], total: 0, pageIndex: 1, pageSize: 20 };
  return data.info ?? { list: [], total: 0, pageIndex: 1, pageSize: 20 };
}

export async function saveOrder(body: Record<string, unknown>) {
  return unwrap(await post<unknown>("Client_SaveOrder", body));
}

export async function saveOrderBind(body: Record<string, unknown>) {
  return unwrap(await post<boolean>("Client_SaveOrderBind", body));
}
