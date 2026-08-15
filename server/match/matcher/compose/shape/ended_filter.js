/**
 * 已结束场剔除（逻辑对齐 match_lifecycle，不 import merge）。
 *
 * 有 Polymarket+OB 双 link：须 PM∧OB 双确认才归档。
 * 仅 PM：身份一致且 pm_sport ended。
 * 仅 OB：原 Round/timer/锁盘/is_live 逻辑。
 */
import { normalizeEpochMs } from "@changmen/shared/time/match_time";
import { findPlatformMatch } from "../sides/orientation_lock.js";
import { liveRound } from "../structure/resolve_structure.js";

const PAST_START_FALLBACK_MS = 30 * 60 * 1000;
export const ALL_SOURCES_GONE_MS = 3 * 60 * 1000;

function isInLiveTimer(matchs, timersByProvider) {
  for (const [provider, sourceId] of Object.entries(matchs || {})) {
    const hit = liveRound(timersByProvider, provider, sourceId);
    if (hit.round > 0)
      return true;
  }
  return false;
}

function pickCanonicalIsLive(matchs, platformMatches) {
  const order = ["Polymarket", "OB", "RAY", "IA", "PB", "TF"];
  const linked = Object.entries(matchs || {})
    .map(([provider, sourceId]) => ({
      provider,
      sourceId: String(sourceId),
      pri: order.indexOf(provider) >= 0 ? 100 - order.indexOf(provider) : 0,
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

export function allMapBetsClosed(bets) {
  const list = bets || [];
  const full = list.find(b => (Number(b.Map) || 0) === 0);
  if (full) {
    const fullSources = Object.values(full.Sources || {});
    if (fullSources.length && fullSources.some(s => String(s?.Status || "Normal") === "Normal"))
      return false;
  }
  const mapBets = list.filter(b => (Number(b.Map) || 0) > 0);
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

export function allPlatformSourcesGone(matchs, platformMatches) {
  const providers = Object.entries(matchs || {});
  if (!providers.length)
    return true;
  for (const [provider, sourceId] of providers) {
    if (findPlatformMatch(platformMatches, provider, sourceId))
      return false;
  }
  return true;
}

function isPmSportEnded(pmSport) {
  if (!pmSport || typeof pmSport !== "object")
    return false;
  if (pmSport.ended === true)
    return true;
  const st = String(pmSport.status || "").toLowerCase();
  return st === "finished" || st === "final";
}

export function pmSportMatchesLink(link, pmSport) {
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
 * 已 ended 且 pm_sport 确认结束的馆源 → `"Platform:sourceId"`。
 * （Match 层剔除复活源用；当前 pipeline 未挂接，避免与 activeGap 竞态。）
 */
export function buildEndedSourceTombstones(clientRows) {
  const out = new Set();
  for (const row of clientRows || []) {
    const ended = row?.ended_at ?? row?.endedAt;
    if (ended == null || ended === "")
      continue;
    const pmSport = row?.pm_sport ?? row?.PmSport;
    const matchs = row?.matchs ?? row?.Matchs ?? {};
    const pmLink = matchs?.Polymarket;
    // 有 PM：须 pm_sport 身份一致且已结束，才整场馆源进墓碑
    if (pmLink != null && pmLink !== "") {
      if (!isPmSportEnded(pmSport) || !pmSportMatchesLink(pmLink, pmSport))
        continue;
    }
    else if (!isPmSportEnded(pmSport)) {
      // 无 PM 链接时不靠 pm_sport 墓碑（避免误伤）
      continue;
    }
    for (const [platform, sourceId] of Object.entries(matchs || {})) {
      const sid = String(sourceId ?? "").trim();
      if (!platform || !sid)
        continue;
      out.add(`${platform}:${sid}`);
    }
  }
  return out;
}

/**
 * 历史 ended 行上、已确认结束的 pm_sport，按 Polymarket eventId 索引。
 * 新活跃行 pm_sport 为空时，endPass 可跨行认终态（防幽灵复活）。
 */
export function buildEndedPmSportByPolymarketLink(clientRows) {
  const out = new Map();
  for (const row of clientRows || []) {
    const ended = row?.ended_at ?? row?.endedAt;
    if (ended == null || ended === "")
      continue;
    const pmSport = row?.pm_sport ?? row?.PmSport;
    if (!isPmSportEnded(pmSport))
      continue;
    const matchs = row?.matchs ?? row?.Matchs ?? {};
    const link = matchs?.Polymarket;
    if (link == null || link === "")
      continue;
    if (!pmSportMatchesLink(link, pmSport))
      continue;
    const key = String(link).trim();
    const endedMs = Number(ended) || 0;
    const prev = out.get(key);
    if (!prev || endedMs >= (Number(prev._endedAt) || 0))
      out.set(key, { ...pmSport, _endedAt: endedMs });
  }
  return out;
}

/** 从 matches 去掉墓碑馆源（原地）。@returns {number} 清除条数
 *  当前未挂 pipeline：先 strip 会导致活跃幽灵进 activeGap 而关不掉。
 */
export function stripTombstonedPlatformSources(matches, tombstones) {
  if (!matches || !tombstones?.size)
    return 0;
  let cleared = 0;
  for (const [platform, byId] of Object.entries(matches)) {
    if (!byId || typeof byId !== "object")
      continue;
    for (const sid of Object.keys(byId)) {
      if (!tombstones.has(`${platform}:${sid}`))
        continue;
      delete byId[sid];
      cleared += 1;
    }
  }
  return cleared;
}

function isObConfirmEnded(row, platformMatches, timersByProvider) {
  const hasOb = row?.Matchs?.OB != null && row.Matchs.OB !== "";
  if (!hasOb)
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

export function isClientMatchEnded(row, platformMatches, timersByProvider, now = Date.now(), pmSport = null) {
  const startMs = normalizeEpochMs(row?.StartTime);

  if (startMs > 0 && startMs <= now - ALL_SOURCES_GONE_MS
    && allPlatformSourcesGone(row?.Matchs, platformMatches)) {
    return true;
  }

  const hasPm = row?.Matchs?.Polymarket != null && row.Matchs.Polymarket !== "";
  const hasOb = row?.Matchs?.OB != null && row.Matchs.OB !== "";
  const pmLink = row?.Matchs?.Polymarket;

  if (hasPm && hasOb) {
    const pmOk = isPmConfirmEnded(pmLink, pmSport, startMs, now);
    const obOk = isObConfirmEnded(row, platformMatches, timersByProvider) === true;
    return pmOk && obOk;
  }

  if (hasPm && !hasOb)
    return isPmConfirmEnded(pmLink, pmSport, startMs, now);

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

export function buildPmSportByClientId(clientRowsOrMap) {
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

export function filterActiveClientMatches(list, ctx = {}) {
  const {
    platformMatches = {},
    timersByProvider = {},
    pmSportByClientId,
    endedAtByClientId,
    endedPmSportByPolymarketLink,
    now = Date.now(),
  } = ctx;
  const kept = [];
  const endedList = [];
  let endedCount = 0;
  for (const row of list || []) {
    const id = Number(row?.ID ?? row?.id);
    const stickyEnded = Number.isFinite(id)
      && endedAtByClientId?.has(id)
      && endedAtByClientId.get(id) != null;
    const pmLink = row?.Matchs?.Polymarket ?? row?.matchs?.Polymarket;
    const ownPm = (Number.isFinite(id) && pmSportByClientId?.get(id))
      || row?.PmSport
      || row?.pm_sport
      || null;
    const inherited = (!ownPm && pmLink != null && pmLink !== ""
      && endedPmSportByPolymarketLink?.get(String(pmLink)))
      || null;
    const pmSport = ownPm || inherited || null;
    if (stickyEnded || isClientMatchEnded(row, platformMatches, timersByProvider, now, pmSport)) {
      endedCount++;
      endedList.push(row);
      continue;
    }
    kept.push(row);
  }
  return { list: kept, endedList, endedCount };
}

/** 从 RDS client 行构建 id → ended_at（仅已结束） */
export function buildEndedAtByClientId(clientRowsOrMap) {
  const out = new Map();
  if (clientRowsOrMap instanceof Map) {
    for (const [id, row] of clientRowsOrMap) {
      const ended = row?.ended_at ?? row?.endedAt;
      if (ended != null && ended !== "")
        out.set(Number(id), Number(ended) || ended);
    }
    return out;
  }
  for (const row of clientRowsOrMap || []) {
    const id = Number(row?.id ?? row?.ID);
    if (!Number.isFinite(id))
      continue;
    const ended = row?.ended_at ?? row?.endedAt;
    if (ended != null && ended !== "")
      out.set(id, Number(ended) || ended);
  }
  return out;
}
