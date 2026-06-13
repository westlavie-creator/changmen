import type { VenueOrder } from "@platform/contract";

/** 对齐 A8：场馆订单列表首条 status 为 reject 视为拒单 */
export function isVenueReject(orders: VenueOrder[]): boolean {
  return orders.length > 0 && orders[0].status === "reject";
}
