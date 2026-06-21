import { setOrdersBoundHook, setOrdersInsertedHook } from "@changmen/db";
import { enqueueNewOrdersFromRows } from "./order_notify.js";

/** 注册服务端管理员通知（RDS hook、定时任务等） */
export function setupAdminTools() {
  const onOrders = rows => enqueueNewOrdersFromRows(rows);
  setOrdersInsertedHook(onOrders);
  setOrdersBoundHook(onOrders);
}
