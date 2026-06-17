/** 对齐 A8 bundle `DG` 消息通知类型 */
export const NOTIFY_TYPES = [
  "Balance",
  "Profit",
  "Limit",
  "OrderReport",
  "OrderPush",
  "OrderNotify",
  /** [changmen 扩展] 套利执行链路摘要 */
  "ArbFlow",
] as const;

export type NotifyType = (typeof NOTIFY_TYPES)[number];
