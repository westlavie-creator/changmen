/**
 * 足球订单 Client_*。禁止进入电竞账号订单分发。
 */
import { listFootballOrders, saveFootballOrder } from "../football/football_order_service.js";

const FOOTBALL_ORDER_ACTIONS = new Set([
  "Client_SaveFootballOrder",
  "Client_GetFootballOrders",
]);

function ok(info, msg = "ok") {
  return { success: 1, msg, info: info ?? null };
}

function fail(msg) {
  return { success: 0, msg, info: null };
}

export function isFootballOrderAction(action) {
  return FOOTBALL_ORDER_ACTIONS.has(String(action));
}

export async function handleFootballOrderAction(action, body, ctx) {
  if (!isFootballOrderAction(action))
    return null;
  if (!ctx?.user)
    return fail("未登录");
  try {
    if (action === "Client_SaveFootballOrder") {
      const saved = await saveFootballOrder(body, ctx.user);
      return saved.ok ? ok(saved.info) : fail(saved.msg);
    }
    if (action === "Client_GetFootballOrders") {
      const listed = await listFootballOrders(ctx.user, body);
      return listed.ok ? ok(listed.info) : fail(listed.msg);
    }
    return fail(`未知足球订单 action: ${action}`);
  }
  catch (err) {
    return fail(err instanceof Error ? err.message : "足球订单失败");
  }
}
