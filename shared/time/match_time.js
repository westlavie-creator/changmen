"use strict";

// [A8 可证实] bundle 过滤：y.start_time < Date.now()/1e3 + 3600
// 只有上限（未来 1 小时），无下限——已开赛比赛只要平台还在返回就保留
const A8_MATCH_MAX_FUTURE_SEC = 3600;
const A8_MATCH_LIST_MAX_FUTURE_SEC = A8_MATCH_MAX_FUTURE_SEC;

/** IM 仅推赔率：超过该时长无推送则从列表剔除 */
const IM_ODDS_ACTIVE_MS = 3 * 60 * 60 * 1000;

function normalizeEpochMs(raw) {
  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0) return 0;
  if (n < 1e12) return Math.floor(n * 1000);
  return Math.floor(n);
}

/** [A8 可证实] start_time < Date.now()/1e3 + 3600，无过去下限 */
function a8StartTimeCollectAllowed(startMs) {
  const ms = normalizeEpochMs(startMs);
  if (!ms) return true;
  return ms <= Date.now() + A8_MATCH_MAX_FUTURE_SEC * 1000;
}

function a8StartTimeListAllowed(startMs) {
  const ms = normalizeEpochMs(startMs);
  if (!ms) return true;
  return ms <= Date.now() + A8_MATCH_LIST_MAX_FUTURE_SEC * 1000;
}

module.exports = {
  A8_MATCH_MAX_FUTURE_SEC,
  A8_MATCH_MAX_FUTURE_MS: A8_MATCH_MAX_FUTURE_SEC * 1000,
  A8_MATCH_LIST_MAX_FUTURE_SEC,
  A8_MATCH_LIST_MAX_FUTURE_MS: A8_MATCH_LIST_MAX_FUTURE_SEC * 1000,
  IM_ODDS_ACTIVE_MS,
  normalizeEpochMs,
  a8StartTimeCollectAllowed,
  a8StartTimeListAllowed,
};
