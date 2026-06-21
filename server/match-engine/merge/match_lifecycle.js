/**
 * client_matches 列表可见性：进行中/未开赛保持 0，已结束 → list_status -1。
 */

import { normalizeEpochMs } from "@changmen/shared/time/match_time";
import { PROVIDER_PRIORITY } from "../teams/provider_priority.js";
import { liveRound } from "./match_merge.js";

/** 无 is_live 且无地图锁盘信号时的兜底等待（避免误判） */
const PAST_START_FALLBACK_MS = 30 * 60 * 1000;

/** 所有平台停止 saveMatch 后视为结束的等待时间（最长采集间隔 60s × 3） */
const ALL_SOURCES_GONE_MS = 3 * 60 * 1000;

function findPlatformMatch(matches, provider, sourceMatchId) {
  const sid = String(sourceMatchId);
  const byId = matches?.[provider];
  if (!byId)
    return null;
  if (byId[sid])
    return byId[sid];
  return Object.values(byId).find(m => String(m.SourceMatchID) === sid) || null;
}

function isInLiveTimer(matchs, timersByProvider) {
  for (const [provider, sourceId] of Object.entries(matchs || {})) {
    const hit = liveRound(timersByProvider, provider, sourceId);
    if (hit.round > 0)
      return true;
  }
  return false;
}

/** 按平台优先级取第一个有 is_live 的平台赛 */
function pickCanonicalIsLive(matchs, platformMatches) {
  const linked = Object.entries(matchs || {})
    .map(([provider, sourceId]) => ({
      provider,
      sourceId: String(sourceId),
      pri: PROVIDER_PRIORITY[provider] || 0,
    }))
    .sort((a, b) => b.pri - a.pri);
  for (const { provider, sourceId } of linked) {
    const pm = findPlatformMatch(platformMatches, provider, sourceId);
    if (!pm)
      continue;
    const raw = pm.IsLive ?? pm.is_live;
    if (raw != null && raw !== "")
      return Number(raw);
  }
  return null;
}

/** 地图盘（Map>0）均有源且全部 Locked；若有 Map=0 全场盘且任一侧 Normal，视为未结束 */
function allMapBetsClosed(bets) {
  const list = bets || [];
  const full = list.find(b => (b.Map ?? 0) === 0);
  if (full) {
    const fullSources = Object.values(full.Sources || {});
    if (fullSources.length && fullSources.some(s => String(s?.Status || "Normal") === "Normal")) {
      return false;
    }
  }
  const mapBets = list.filter(b => (b.Map ?? 0) > 0);
  if (!mapBets.length)
    return false;
  for (const bet of mapBets) {
    const sources = Object.values(bet.Sources || {});
    if (!sources.length)
      return false;
    if (sources.some(s => String(s?.Status || "Normal") === "Normal"))
      return false;
  }
  return true;
}

function matchHasObLink(matchs) {
  const obId = matchs?.OB;
  return obId != null && obId !== "";
}

/** 所有平台来源都已从 platform_matches 消失（saveMatch 不再上报） */
function allPlatformSourcesGone(matchs, platformMatches) {
  const providers = Object.entries(matchs || {});
  if (!providers.length)
    return true;
  for (const [provider, sourceId] of providers) {
    if (findPlatformMatch(platformMatches, provider, sourceId))
      return false;
  }
  return true;
}

/**
 * 是否应隐藏（list_status=-1）。未开赛、进行中返回 false。
 * @param {object} row client match 行（含 Round/StartTime/Matchs/Bets）
 * @param {object} platformMatches normalizeMatchesShape 结果
 * @param {object} timersByProvider live_timers 快照
 * @param {number} [now]
 */
function isClientMatchEnded(row, platformMatches, timersByProvider, now = Date.now()) {
  const startMs = normalizeEpochMs(row?.StartTime);

  // 所有平台都已停止 saveMatch 上报：即使 live_timers 残留（OB getTimer 不清已结束
  // 比赛），也判定为结束。saveMatch 是整批快照替换，不在最新批次里 = 该平台认为比赛
  // 已结束。等待 3 分钟（最长采集间隔 60s × 3）确保不是采集临时中断。
  if (startMs > 0 && startMs <= now - ALL_SOURCES_GONE_MS
    && allPlatformSourcesGone(row?.Matchs, platformMatches)) {
    return true;
  }

  if (Number(row?.Round) > 0)
    return false;
  if (isInLiveTimer(row?.Matchs, timersByProvider))
    return false;

  if (startMs > now)
    return false;

  const hasOb = matchHasObLink(row?.Matchs);
  const isLive = hasOb ? pickCanonicalIsLive(row?.Matchs, platformMatches) : null;
  const closed = allMapBetsClosed(row?.Bets);

  if (hasOb && isLive === 2)
    return false;

  if (startMs <= now && closed)
    return true;

  if (hasOb && isLive == null && startMs <= now - PAST_START_FALLBACK_MS)
    return true;

  return false;
}

export {
  ALL_SOURCES_GONE_MS,
  allMapBetsClosed,
  allPlatformSourcesGone,
  isClientMatchEnded,
  isInLiveTimer,
  pickCanonicalIsLive,
};
