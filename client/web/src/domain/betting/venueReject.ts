import type { VenueOrder } from "@venue/contract";

/** 对齐 A8：场馆订单列表首条 status 为 reject 视为拒单 */
export function isVenueReject(orders: VenueOrder[]): boolean {
  return orders.length > 0 && orders[0].status === "reject";
}

export interface VenueRejectLegResult {
  success?: boolean;
  orderId?: string | null;
}

/**
 * 有本次 orderId 时只判本单是否 reject，不继承 orders[0] 历史拒单；
 * 无 orderId 时回落 A8 isVenueReject(orders[0])。
 */
export function isVenueOrderIdRejected(
  orders: VenueOrder[],
  orderId: string | null | undefined,
): boolean {
  const id = String(orderId ?? "").trim();
  if (!id)
    return isVenueReject(orders);
  const ours = orders.find(o => o.orderId === id);
  if (ours)
    return ours.status === "reject";
  return false;
}

/** jb / 套利拒单检测：成功腿带 orderId 时按本单判拒 */
export function resolveVenueRejectForLeg(
  orders: VenueOrder[],
  legResult?: VenueRejectLegResult,
): boolean {
  if (legResult?.success) {
    const orderId = String(legResult.orderId ?? "").trim();
    if (orderId)
      return isVenueOrderIdRejected(orders, orderId);
  }
  return isVenueReject(orders);
}

/** [A8 可证实] jb / 套利 A8 场馆：仅 `orders[0].status === reject` */
export function resolveA8VenueReject(orders: VenueOrder[]): boolean {
  return isVenueReject(orders);
}

/** [A8 可证实] jb / 套利 A8 场馆：列表非空时绑 `orders[0].orderId` */
export function resolveA8VenueBindOrderId(orders: VenueOrder[]): string | undefined {
  if (orders.length === 0)
    return undefined;
  const id = String(orders[0].orderId ?? "").trim();
  return id || undefined;
}
