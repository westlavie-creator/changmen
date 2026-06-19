/** 套利 LinkID 下限（与 SaveOrderBind Date.now() 对齐） */
export const ARB_LINK_MIN = 1_000_000_000_000;

/**
 * [changmen 推测] 旧占位：link = create_at（场馆时间 ms）；仅 legacy 读路径/迁移用。
 */
export function placeholderLinkFromCreateAt(createAt, fallbackMs = Date.now()) {
  const ts = Number(createAt);
  if (Number.isFinite(ts) && ts > 0) return ts;
  const fb = Number(fallbackMs);
  return Number.isFinite(fb) && fb > 0 ? fb : Date.now();
}

/** 未绑单 SaveOrder 占位 Link = RDS 入库时刻（ms） */
export function placeholderLinkFromInsertAt(insertMs = Date.now()) {
  const ts = Number(insertMs);
  if (Number.isFinite(ts) && ts > 0) return ts;
  return Date.now();
}

/** 非套利 SaveOrder 后端绑定：略早于 create_at，满足 link < create_at */
export function backendBindLinkFromCreateAt(createAt) {
  const ca = Number(createAt);
  if (Number.isFinite(ca) && ca > 1) return ca - 1;
  const now = Date.now();
  return now > 1 ? now - 1 : 0;
}

/** 旧 changmen 占位 hash：link 为 0 / null 或 0 < link < 1e12 */
export function isHashLink(link) {
  const n = Number(link);
  if (!Number.isFinite(n) || n === 0) return true;
  if (n > 0 && n < ARB_LINK_MIN) return true;
  return false;
}

/** legacy 未绑单占位：link 与 create_at 同为 ms 时间戳 */
export function isCreateAtPlaceholderLink(link, createAt) {
  const l = Number(link);
  const ca = Number(createAt);
  if (!Number.isFinite(l) || l < ARB_LINK_MIN) return false;
  if (!Number.isFinite(ca) || ca <= 0) return false;
  return l === ca;
}

/** 未绑单 RDS 入库占位：≥ 1e12 且晚于场馆 create_at（与 legacy create_at 占位区分） */
export function isInsertTimePlaceholderLink(link, createAt) {
  const l = Number(link);
  const ca = Number(createAt);
  if (!Number.isFinite(l) || l < ARB_LINK_MIN) return false;
  if (isCreateAtPlaceholderLink(l, ca)) return false;
  if (!Number.isFinite(ca) || ca <= 0) return true;
  return l > ca;
}

/** SaveOrderBind 写入的套利/共享 LinkID（≥ 1e12） */
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
  if (isCreateAtPlaceholderLink(prevLink, prevRow?.create_at)) return true;
  return isInsertTimePlaceholderLink(prevLink, prevRow?.create_at);
}

/** 仅 PB 平台的 hash 占位单（读路径与通知均排除） */
export function isPbHashOrder(link, provider) {
  if (!isHashLink(link)) return false;
  return String(provider ?? "").trim() === "PB";
}

/** [A8 可证实] bundle 无客户端过滤；通知等辅助判断（非 changmen 侧栏 SQL） */
export function isOrderListVisible(link, provider) {
  const n = Number(link);
  if (Number.isFinite(n) && n < 0) return true;
  if (Number.isFinite(n) && n >= ARB_LINK_MIN) return true;
  return String(provider ?? "").trim() !== "PB";
}

/**
 * [已废弃] 曾用 link < create_at 隐藏 A8 同步单；订单查询现返回全量。
 */
export const CLIENT_ORDER_LIST_SQL = "link < create_at";

export function isClientOrderListVisible(link, createAt) {
  const l = Number(link);
  const ca = Number(createAt);
  if (!Number.isFinite(l) || !Number.isFinite(ca)) return false;
  return l < ca;
}

/** 拼到已有 WHERE 后：`base AND link < create_at` */
export function orderVisibleSqlAnd(baseWhere) {
  const w = String(baseWhere || "").trim();
  if (!w) return CLIENT_ORDER_LIST_SQL;
  return `${w} AND ${CLIENT_ORDER_LIST_SQL}`;
}
