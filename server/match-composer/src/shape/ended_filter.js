/**
 * 已结束场剔除（逻辑对齐 match_lifecycle，不 import merge）。
 */
import { normalizeEpochMs } from "@changmen/shared/time/match_time";
import { findPlatformMatch } from "../sides/orientation_lock.js";
import { liveRound } from "./live_shape.js";

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

export function isClientMatchEnded(row, platformMatches, timersByProvider, now = Date.now(), pmSport = null) {
  const startMs = normalizeEpochMs(row?.StartTime);

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

  const hasPm = row?.Matchs?.Polymarket != null && row.Matchs.Polymarket !== "";
  const pmEnded = hasPm && isPmSportEnded(pmSport);
  const closed = allMapBetsClosed(row?.Bets);

  if (pmEnded && startMs <= now && closed)
    return true;

  const hasOb = row?.Matchs?.OB != null && row.Matchs.OB !== "";
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
    now = Date.now(),
  } = ctx;
  const kept = [];
  let endedCount = 0;
  for (const row of list || []) {
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
