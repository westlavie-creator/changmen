/**
 * client_matches 生命周期：判断比赛是否已结束（供 archive 移入 history）。
 *
 * 有 Polymarket+OB 双 link：须 PM∧OB 双确认才归档。
 * 仅 PM：身份一致且 pm_sport ended。
 * 仅 OB：原 Round/timer/锁盘/is_live 逻辑。
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

/** 仅读 OB 平台行的 is_live（双确认路径用，避免被 PM 行抢先） */
function pickObIsLive(matchs, platformMatches) {
  const obId = matchs?.OB;
  if (obId == null || obId === "")
    return null;
  const pm = findPlatformMatch(platformMatches, "OB", obId);
  if (!pm)
    return null;
  const raw = pm.IsLive ?? pm.is_live;
  if (raw == null || raw === "")
    return null;
  return Number(raw);
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

/**
 * 地图盘上 OB 源均为 Locked；若全无 OB 源则视为通过。
 * Map=0 上若有 OB Normal → 未结束。
 */
function obMapSourcesLockedOrAbsent(bets) {
  const list = bets || [];
  for (const bet of list) {
    const ob = bet?.Sources?.OB;
    if (!ob)
      continue;
    if (String(ob.Status || "Normal") === "Normal")
      return false;
  }
  return true;
}

function matchHasObLink(matchs) {
  const obId = matchs?.OB;
  return obId != null && obId !== "";
}

function matchHasPolymarketLink(matchs) {
  const pmId = matchs?.Polymarket;
  return pmId != null && pmId !== "";
}

/** @param {object | null | undefined} pmSport client_matches.pm_sport 快照 */
function isPmSportEnded(pmSport) {
  if (!pmSport || typeof pmSport !== "object")
    return false;
  if (pmSport.ended === true)
    return true;
  const st = String(pmSport.status || "").toLowerCase();
  return st === "finished" || st === "final";
}

/**
 * pm_sport 身份是否对应当前 Matchs.Polymarket（防 COALESCE 脏 ended）。
 * link 可为 event id 或 slug；snapshot 带 slug / eventId / id。
 */
function pmSportMatchesLink(link, pmSport) {
  const key = String(link ?? "").trim();
  if (!key || !pmSport || typeof pmSport !== "object")
    return false;
  const candidates = [
    pmSport.slug,
    pmSport.eventId,
    pmSport.event_id,
    pmSport.id,
  ];
  for (const c of candidates) {
    if (c != null && String(c).trim() === key)
      return true;
  }
  return false;
}

/** PM 确认：身份一致 + ended + 已开赛 */
function isPmConfirmEnded(link, pmSport, startMs, now) {
  if (!pmSportMatchesLink(link, pmSport))
    return false;
  if (!isPmSportEnded(pmSport))
    return false;
  if (!(startMs > 0 && startMs <= now))
    return false;
  return true;
}

/**
 * OB 确认结束：Round/timer 清、is_live≠2、OB 地图源 Locked（或无 OB 源）。
 * @returns {boolean | null} null=无 OB link
 */
function isObConfirmEnded(row, platformMatches, timersByProvider) {
  if (!matchHasObLink(row?.Matchs))
    return null;
  if (Number(row?.Round) > 0)
    return false;
  if (isInLiveTimer(row?.Matchs, timersByProvider))
    return false;
  const isLive = pickObIsLive(row?.Matchs, platformMatches);
  if (isLive === 2)
    return false;
  return obMapSourcesLockedOrAbsent(row?.Bets);
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
 * 比赛是否已结束。未开赛、进行中返回 false。
 * @param {object} row client match 行（含 Round/StartTime/Matchs/Bets）
 * @param {object} platformMatches normalizeMatchesShape 结果
 * @param {object} timersByProvider live_timers 快照
 * @param {number} [now]
 * @param {object | null | undefined} [pmSport] Polymarket pm_sport（仅 Polymarket link 时参与判定）
 */
function isClientMatchEnded(row, platformMatches, timersByProvider, now = Date.now(), pmSport = null) {
  const startMs = normalizeEpochMs(row?.StartTime);

  // 所有平台都已停止 saveMatch 上报：即使 live_timers 残留（OB getTimer 不清已结束
  // 比赛），也判定为结束。saveMatch 是整批快照替换，不在最新批次里 = 该平台认为比赛
  // 已结束。等待 3 分钟（最长采集间隔 60s × 3）确保不是采集临时中断。
  if (startMs > 0 && startMs <= now - ALL_SOURCES_GONE_MS
    && allPlatformSourcesGone(row?.Matchs, platformMatches)) {
    return true;
  }

  const hasPm = matchHasPolymarketLink(row?.Matchs);
  const hasOb = matchHasObLink(row?.Matchs);
  const pmLink = row?.Matchs?.Polymarket;

  // 双 link：须 PM∧OB 双确认；无可用 PM 信号时不因 OB 锁盘单方归档
  if (hasPm && hasOb) {
    const pmOk = isPmConfirmEnded(pmLink, pmSport, startMs, now);
    const obOk = isObConfirmEnded(row, platformMatches, timersByProvider) === true;
    return pmOk && obOk;
  }

  // 仅 PM：身份一致且 ended
  if (hasPm && !hasOb)
    return isPmConfirmEnded(pmLink, pmSport, startMs, now);

  // 仅 OB（或无 PM）：原逻辑
  if (Number(row?.Round) > 0)
    return false;
  if (isInLiveTimer(row?.Matchs, timersByProvider))
    return false;

  if (startMs > now)
    return false;

  const closed = allMapBetsClosed(row?.Bets);
  const isLive = hasOb ? pickCanonicalIsLive(row?.Matchs, platformMatches) : null;

  if (hasOb && isLive === 2)
    return false;

  if (startMs <= now && closed)
    return true;

  if (hasOb && isLive == null && startMs <= now - PAST_START_FALLBACK_MS)
    return true;

  return false;
}

/** @param {Array<object> | Map<number, object>} clientRowsOrMap RDS client_rows 或 id→pm_sport */
function buildPmSportByClientId(clientRowsOrMap) {
  /** @type {Map<number, object>} */
  const out = new Map();
  if (clientRowsOrMap instanceof Map) {
    for (const [id, pm] of clientRowsOrMap) {
      if (pm && typeof pm === "object")
        out.set(Number(id), pm);
    }
    return out;
  }
  for (const row of clientRowsOrMap || []) {
    const id = Number(row?.id ?? row?.ID);
    if (!Number.isFinite(id))
      continue;
    const pm = row?.pm_sport ?? row?.PmSport;
    if (pm && typeof pm === "object")
      out.set(id, pm);
  }
  return out;
}

/**
 * matchMerge 写库前剔除已结束场次（差量删除 → client_matches_history）。
 * @param {object[]} list
 * @param {{ platformMatches?: object, timersByProvider?: object, pmSportByClientId?: Map<number, object>, now?: number }} ctx
 */
function filterActiveClientMatches(list, ctx = {}) {
  const {
    platformMatches = {},
    timersByProvider = {},
    pmSportByClientId,
    now = Date.now(),
  } = ctx;
  const input = list || [];
  const kept = [];
  let endedCount = 0;
  for (const row of input) {
    const id = Number(row?.ID ?? row?.id);
    const pmSport = (Number.isFinite(id) && pmSportByClientId?.get(id))
      || row?.PmSport
      || row?.pm_sport
      || null;
    if (isClientMatchEnded(row, platformMatches, timersByProvider, now, pmSport)) {
      endedCount++;
      continue;
    }
    kept.push(row);
  }
  return { list: kept, endedCount };
}

export {
  ALL_SOURCES_GONE_MS,
  allMapBetsClosed,
  allPlatformSourcesGone,
  buildPmSportByClientId,
  filterActiveClientMatches,
  isClientMatchEnded,
  isInLiveTimer,
  isObConfirmEnded,
  isPmConfirmEnded,
  isPmSportEnded,
  matchHasPolymarketLink,
  obMapSourcesLockedOrAbsent,
  pickCanonicalIsLive,
  pickObIsLive,
  pmSportMatchesLink,
};
