/**
 * PM 足球独立采集单轮：强制刷新 Gamma，并安全发布共享快照。
 * backend 在 PM_FOOTBALL_COLLECTOR_OWNED=1 时只读该快照。
 */
import {
  fetchFootballAsClientMatchDtos,
  FOOTBALL_CACHE_KEY,
} from "../../backend/core/esport-api/football_gamma_fetch.js";
import {
  readSportListCache,
  writeSportListCache,
} from "../../backend/core/esport-api/sport_list_cache.js";

export async function runPmFootballDiscoveryCycle(deps = {}) {
  const fetchRows = deps.fetchRows || (() => fetchFootballAsClientMatchDtos({ forceRefresh: true }));
  const readSnapshot = deps.readSnapshot || (() => readSportListCache(FOOTBALL_CACHE_KEY));
  const writeSnapshot = deps.writeSnapshot || ((rows, at) => writeSportListCache(FOOTBALL_CACHE_KEY, rows, at));
  const now = deps.now || Date.now;

  const before = readSnapshot();
  const rows = await fetchRows();
  if (!Array.isArray(rows))
    throw new Error("PM football collector returned a non-array snapshot");

  // 上游瞬时空响应不得抹掉已有足球列表；真实空窗由后续显式策略处理。
  if (!rows.length && before?.rows?.length) {
    writeSnapshot(before.rows, before.at);
    return { skipped: true, reason: "empty-refresh", matches: before.rows.length, publishedAt: before.at };
  }

  const publishedAt = now();
  writeSnapshot(rows, publishedAt);
  return { skipped: false, matches: rows.length, publishedAt };
}
