"use strict";

/** A8 OB/SABA 采集轮询：开赛时间不得超过当前 +1 小时（秒级比较） */
const A8_MATCH_MAX_FUTURE_SEC = 3600;
/** 列表入库/Client_GetMatchs：与 A8 采集一致，仅未来 1 小时内 */
const A8_MATCH_LIST_MAX_FUTURE_SEC = A8_MATCH_MAX_FUTURE_SEC;
/** 列表展示：允许保留一定过去窗口，避免展示过久历史赛程 */
const A8_MATCH_MAX_PAST_SEC = 12 * 3600;

/** IM 仅推赔率：超过该时长无推送则从列表剔除 */
const IM_ODDS_ACTIVE_MS = 3 * 60 * 60 * 1000;

function normalizeEpochMs(raw) {
  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0) return 0;
  if (n < 1e12) return Math.floor(n * 1000);
  return Math.floor(n);
}

/** 对齐 A8：`start_time < Date.now()/1000 + 3600` */
function a8StartTimeCollectAllowed(startMs) {
  const ms = normalizeEpochMs(startMs);
  if (!ms) return true;
  const now = Date.now();
  return (
    ms >= now - A8_MATCH_MAX_PAST_SEC * 1000 &&
    ms <= now + A8_MATCH_MAX_FUTURE_SEC * 1000
  );
}

function a8StartTimeListAllowed(startMs) {
  const ms = normalizeEpochMs(startMs);
  if (!ms) return true;
  const now = Date.now();
  return (
    ms >= now - A8_MATCH_MAX_PAST_SEC * 1000 &&
    ms <= now + A8_MATCH_LIST_MAX_FUTURE_SEC * 1000
  );
}

module.exports = {
  A8_MATCH_MAX_FUTURE_SEC,
  A8_MATCH_MAX_FUTURE_MS: A8_MATCH_MAX_FUTURE_SEC * 1000,
  A8_MATCH_LIST_MAX_FUTURE_SEC,
  A8_MATCH_LIST_MAX_FUTURE_MS: A8_MATCH_LIST_MAX_FUTURE_SEC * 1000,
  A8_MATCH_MAX_PAST_SEC,
  A8_MATCH_MAX_PAST_MS: A8_MATCH_MAX_PAST_SEC * 1000,
  IM_ODDS_ACTIVE_MS,
  normalizeEpochMs,
  a8StartTimeCollectAllowed,
  a8StartTimeListAllowed,
};
