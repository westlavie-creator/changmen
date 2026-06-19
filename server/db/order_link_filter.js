/** 套利 LinkID 下限（与 SaveOrderBind Date.now() 对齐） */
export const ARB_LINK_MIN = 1_000_000_000_000;

/** SaveOrder 占位 hash：link 为 0 / null 或 0<link<1e12 */
export function isHashLink(link) {
  const n = Number(link);
  if (!Number.isFinite(n) || n === 0) return true;
  if (n > 0 && n < ARB_LINK_MIN) return true;
  return false;
}

/** 仅 PB 平台的 hash 占位单（读路径与通知均排除） */
export function isPbHashOrder(link, provider) {
  if (!isHashLink(link)) return false;
  return String(provider ?? "").trim() === "PB";
}

/** 订单列表读路径：返回全部订单（含外部 hash 占位单） */
export function isOrderListVisible(_link, _provider) {
  return true;
}
