// [A8 可证实] bundle 过滤：y.start_time < Date.now()/1e3 + 3600
// 只有上限（未来 1 小时），无下限——已开赛比赛只要平台还在返回就保留
export const A8_MATCH_MAX_FUTURE_SEC = 3600;
export const A8_MATCH_LIST_MAX_FUTURE_SEC = A8_MATCH_MAX_FUTURE_SEC;

/** IM 仅推赔率：超过该时长无推送则从列表剔除 */
export const IM_ODDS_ACTIVE_MS = 3 * 60 * 60 * 1000;

export function normalizeEpochMs(raw) {
  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0) return 0;
  if (n < 1e12) return Math.floor(n * 1000);
  return Math.floor(n);
}

/** 场馆订单 createAt：秒/毫秒时间戳、数字字符串、ISO/空格日期、Decimal.toNumber() */
export function parseVenueCreateAt(raw, fallback = Date.now()) {
  if (raw == null || raw === "") return fallback;
  if (typeof raw === "number" && Number.isFinite(raw)) {
    const ms = normalizeEpochMs(raw);
    return ms > 0 ? ms : fallback;
  }
  if (typeof raw === "object" && raw !== null) {
    const toNumber = raw.toNumber;
    if (typeof toNumber === "function") {
      const ms = normalizeEpochMs(toNumber.call(raw));
      if (ms > 0) return ms;
    }
  }
  const text = String(raw).trim();
  if (!text) return fallback;
  const asNum = Number(text);
  if (Number.isFinite(asNum) && asNum > 0) {
    const ms = normalizeEpochMs(asNum);
    if (ms > 0) return ms;
  }
  const iso = text.includes("T") ? text : text.replace(" ", "T");
  const parsed = Date.parse(iso);
  if (!Number.isNaN(parsed) && parsed > 0) return parsed;
  return fallback;
}

/** [A8 可证实] start_time < Date.now()/1e3 + 3600，无过去下限 */
export function a8StartTimeCollectAllowed(startMs) {
  const ms = normalizeEpochMs(startMs);
  if (!ms) return true;
  return ms <= Date.now() + A8_MATCH_MAX_FUTURE_SEC * 1000;
}

export function a8StartTimeListAllowed(startMs) {
  const ms = normalizeEpochMs(startMs);
  if (!ms) return true;
  return ms <= Date.now() + A8_MATCH_LIST_MAX_FUTURE_SEC * 1000;
}

export const A8_MATCH_MAX_FUTURE_MS = A8_MATCH_MAX_FUTURE_SEC * 1000;
export const A8_MATCH_LIST_MAX_FUTURE_MS = A8_MATCH_LIST_MAX_FUTURE_SEC * 1000;
