/** 套利 LinkID 下限（与 SaveOrderBind Date.now() 对齐） */
export const ARB_LINK_MIN = 1_000_000_000_000;

/**
 * [changmen 推测] A8 SaveOrder 未绑单占位 Link ≈ create_at（场馆时间 ms）。
 * create_at 无效时回退 fallbackMs / Date.now()。
 */
export function placeholderLinkFromCreateAt(createAt, fallbackMs = Date.now()) {
  const ts = Number(createAt);
  if (Number.isFinite(ts) && ts > 0) return ts;
  const fb = Number(fallbackMs);
  return Number.isFinite(fb) && fb > 0 ? fb : Date.now();
}

/** 旧 changmen 占位 hash：link 为 0 / null 或 0 < link < 1e12 */
export function isHashLink(link) {
  const n = Number(link);
  if (!Number.isFinite(n) || n === 0) return true;
  if (n > 0 && n < ARB_LINK_MIN) return true;
  return false;
}

/** [changmen 推测] 未绑单 create_at 占位：link 与 create_at 同为 ms 时间戳 */
export function isCreateAtPlaceholderLink(link, createAt) {
  const l = Number(link);
  const ca = Number(createAt);
  if (!Number.isFinite(l) || l < ARB_LINK_MIN) return false;
  if (!Number.isFinite(ca) || ca <= 0) return false;
  return l === ca;
}

/** SaveOrderBind 写入的套利/共享 LinkID（≥ 1e12 且非 create_at 占位） */
export function isArbBindLink(link) {
  const n = Number(link);
  return Number.isFinite(n) && n >= ARB_LINK_MIN;
}

/** SaveOrderBind：从占位 link 改为共享 LinkID 时触发 bound 通知 */
export function shouldFireOrderBoundHook(prevRow, linkVal) {
  const prevLink = Number(prevRow?.link);
  const next = Number(linkVal);
  if (!isArbBindLink(next)) return false;
  if (prevLink === next) return false;
  if (isHashLink(prevLink)) return true;
  return isCreateAtPlaceholderLink(prevLink, prevRow?.create_at);
}

/** 仅 PB 平台的 hash 占位单（读路径与通知均排除） */
export function isPbHashOrder(link, provider) {
  if (!isHashLink(link)) return false;
  return String(provider ?? "").trim() === "PB";
}

/** [A8 可证实] bundle 无客户端过滤；仅作通知等辅助判断，不用于 SQL WHERE */
export function isOrderListVisible(link, provider) {
  const n = Number(link);
  if (Number.isFinite(n) && n < 0) return true;
  if (Number.isFinite(n) && n >= ARB_LINK_MIN) return true;
  return String(provider ?? "").trim() !== "PB";
}
