/** 对齐 A8 bundle `DG` 消息通知类型 */
export const NOTIFY_TYPES = [
  "Balance",
  "Profit",
  "Limit",
  "OrderReport",
  "OrderPush",
  "OrderNotify",
] as const;

export type NotifyType = (typeof NOTIFY_TYPES)[number];
