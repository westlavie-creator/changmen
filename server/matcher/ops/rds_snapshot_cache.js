import * as db from "@changmen/db";
import { getClientMatchRowsForSnapshot } from "../../backend/core/db/store.js";
import { isEmbeddedMatcher } from "../../backend/core/shared/matcher_mode.js";
import store from "../../backend/core/esport-api/store.js";

const entries = new Map();
let lastStatsLogAt = 0;

function cloneSnapshot(value) {
  if (value == null)
    return value;
  if (typeof structuredClone === "function")
    return structuredClone(value);
  return JSON.parse(JSON.stringify(value));
}

function metaKey(meta) {
  if (!meta)
    return "";
  return [
    Number(meta.count) || 0,
    Number(meta.marker ?? meta.builtAt) || 0,
    Number(meta.linkedCount) || 0,
    Number(meta.linkedMarker) || 0,
  ].join(":");
}

function snapshotEmpty(value) {
  if (value == null)
    return true;
  if (Array.isArray(value))
    return value.length === 0;
  if (typeof value === "object")
    return Object.keys(value).length === 0;
  return false;
}

function mergeObjectSnapshot(base, overlay) {
  return {
    ...(base && typeof base === "object" ? base : {}),
    ...(overlay && typeof overlay === "object" ? overlay : {}),
  };
}

function platformMatchSourceId(row) {
  return String(row?.SourceMatchID ?? row?.source_match_id ?? "");
}

function linkedClientMatchId(row) {
  if (!row || typeof row !== "object")
    return null;
  const raw = row.ClientMatchId ?? row.client_match_id ?? row.match_id;
  if (raw == null || raw === "")
    return null;
  const id = Number(raw);
  return Number.isFinite(id) ? id : null;
}

function withLinkedClientMatchId(row, linkedId) {
  if (linkedId == null)
    return row;
  return {
    ...row,
    ClientMatchId: linkedId,
    client_match_id: linkedId,
    match_id: linkedId,
  };
}

/** RDS 为准：hot 仅刷新 RDS 仍存在的 source_match_id，禁止复活已快照删除的行 */
function mergePlatformMatchesSnapshot(rdsRaw, hotRaw) {
  if (!hotRaw || !Object.keys(hotRaw).length)
    return rdsRaw || {};
  const out = { ...(rdsRaw && typeof rdsRaw === "object" ? rdsRaw : {}) };
  for (const [platform, hotRows] of Object.entries(hotRaw)) {
    if (!Array.isArray(hotRows) || !hotRows.length)
      continue;
    const rdsRows = Array.isArray(out[platform]) ? out[platform] : [];
    const rdsById = new Map(rdsRows.map(m => [platformMatchSourceId(m), m]));
    const refreshed = [];
    for (const hotRow of hotRows) {
      const sid = platformMatchSourceId(hotRow);
      if (!sid)
        continue;
      const rdsRow = rdsById.get(sid);
      if (!rdsRow)
        continue;
      const linkedId = linkedClientMatchId(hotRow) ?? linkedClientMatchId(rdsRow);
      refreshed.push({
        ...rdsRow,
        ...hotRow,
        ...withLinkedClientMatchId({}, linkedId),
      });
    }
    const refreshedIds = new Set(refreshed.map(m => platformMatchSourceId(m)));
    const untouched = rdsRows.filter(m => !refreshedIds.has(platformMatchSourceId(m)));
    const merged = [...refreshed, ...untouched];
    if (merged.length)
      out[platform] = merged;
    else
      delete out[platform];
  }
  return out;
}

function activePlatformMatchIds(rdsMatchesRaw) {
  const out = new Map();
  for (const [platform, rows] of Object.entries(rdsMatchesRaw || {})) {
    if (!Array.isArray(rows))
      continue;
    const ids = new Set();
    for (const row of rows) {
      const sid = platformMatchSourceId(row);
      if (sid)
        ids.add(sid);
    }
    if (ids.size)
      out.set(platform, ids);
  }
  return out;
}

/** RDS 为准：hot bets 仅覆盖仍存在于 platform_matches 的 source_match_id */
function mergeBetsSnapshotRdsTruth(rdsBets, hotBets, rdsMatchesRaw) {
  if (!hotBets || typeof hotBets !== "object" || !Object.keys(hotBets).length)
    return rdsBets || {};
  const base = (rdsBets && typeof rdsBets === "object") ? { ...rdsBets } : {};
  const active = activePlatformMatchIds(rdsMatchesRaw);
  for (const [key, hotRow] of Object.entries(hotBets)) {
    const colon = key.indexOf(":");
    if (colon <= 0)
      continue;
    const platform = key.slice(0, colon);
    const matchId = key.slice(colon + 1);
    if (active.get(platform)?.has(String(matchId)))
      base[key] = hotRow;
  }
  return base;
}

async function readCached(key, meta, reader, opts = {}) {
  const sig = metaKey(meta);
  const cur = entries.get(key);
  if (cur && sig && cur.sig === sig) {
    cur.hits++;
    return cloneSnapshot(cur.value);
  }

  const value = await reader();
  if ((Number(meta?.count) || 0) > 0 && snapshotEmpty(value)) {
    if (cur?.value && !snapshotEmpty(cur.value)) {
      console.warn(`[matcher] ${key} RDS snapshot returned empty despite meta count=${meta.count}; using previous cache`);
      return cloneSnapshot(cur.value);
    }
    throw new Error(`${key} RDS snapshot is empty but meta count=${meta.count}; abort matchMerge`);
  }
  if (opts.critical && !meta && snapshotEmpty(value)) {
    if (cur?.value && !snapshotEmpty(cur.value)) {
      console.warn(`[matcher] ${key} RDS meta unavailable and snapshot empty; using previous cache`);
      return cloneSnapshot(cur.value);
    }
    throw new Error(`${key} RDS snapshot is empty and meta unavailable; abort matchMerge`);
  }
  entries.set(key, {
    sig,
    value,
    hits: 0,
    loadedAt: Date.now(),
  });
  return cloneSnapshot(value);
}

function logCacheStats() {
  const now = Date.now();
  if (now - lastStatsLogAt < 60_000)
    return;
  lastStatsLogAt = now;
  const parts = [...entries.entries()].map(([key, entry]) => {
    const ageSec = Math.round((now - entry.loadedAt) / 1000);
    return `${key}:hits=${entry.hits},age=${ageSec}s`;
  });
  if (parts.length)
    console.log(`[matcher] rds snapshot cache ${parts.join(" | ")}`);
}

export function invalidateMatcherRdsSnapshot(keys = []) {
  const targetKeys = Array.isArray(keys) && keys.length ? keys : [...entries.keys()];
  for (const key of targetKeys) entries.delete(key);
}

async function fetchEmbeddedMemorySnapshot() {
  const full = store.getCollectorFullSnapshot?.();
  if (!full?.hasMatches && !full?.hasBets)
    return null;

  let clientRows = getClientMatchRowsForSnapshot();
  if (!clientRows.length)
    clientRows = await db.fetchClientMatches() || [];

  const rdsMatchesRaw = await db.fetchPlatformMatches();
  const rdsBets = await db.fetchPlatformBets();
  let matchesRaw = rdsMatchesRaw || {};
  if (full?.hasMatches)
    matchesRaw = mergePlatformMatchesSnapshot(rdsMatchesRaw, cloneSnapshot(full.matchesRaw));
  const bets = full?.hasBets
    ? mergeBetsSnapshotRdsTruth(rdsBets, cloneSnapshot(full.bets), matchesRaw)
    : (rdsBets || {});

  return {
    matchesRaw,
    bets,
    timers: cloneSnapshot(full.timers),
    clientRows: cloneSnapshot(clientRows),
    alignClientRows: cloneSnapshot(clientRows),
    hotCollector: {
      matches: !!full?.hasMatches,
      bets: !!full?.hasBets,
      timers: !!full.hasTimers,
    },
  };
}

export async function fetchMatcherRdsSnapshot() {
  if (isEmbeddedMatcher()) {
    const mem = await fetchEmbeddedMemorySnapshot();
    if (mem) {
      logCacheStats();
      return mem;
    }
  }

  const hot = store.getCollectorHotSnapshot?.();
  const [platformMeta, clientMeta] = await Promise.all([
    db.fetchPlatformCollectorMeta(),
    db.fetchClientMatchesMeta(),
  ]);

  const [rdsMatchesRaw, rdsBets, rdsTimers, clientRows] = await Promise.all([
    readCached("platformMatches", platformMeta?.platformMatches, db.fetchPlatformMatches, { critical: true }),
    readCached("platformBets", platformMeta?.platformBets, db.fetchPlatformBets),
    readCached("liveTimers", platformMeta?.liveTimers, db.fetchLiveTimers),
    readCached("clientMatches", clientMeta, db.fetchClientMatches, { critical: true }),
  ]);

  const matchesRaw = hot?.hasMatches
    ? mergePlatformMatchesSnapshot(rdsMatchesRaw, hot.matchesRaw)
    : rdsMatchesRaw;
  const bets = hot?.hasBets
    ? mergeBetsSnapshotRdsTruth(rdsBets, hot.bets, matchesRaw)
    : rdsBets;
  const timers = hot?.hasTimers
    ? mergeObjectSnapshot(rdsTimers, hot.timers)
    : rdsTimers;

  logCacheStats();
  return {
    matchesRaw,
    bets,
    timers,
    clientRows: clientRows || [],
    alignClientRows: clientRows || [],
    hotCollector: {
      matches: !!hot?.hasMatches,
      bets: !!hot?.hasBets,
      timers: !!hot?.hasTimers,
    },
  };
}

export { mergeBetsSnapshotRdsTruth, mergePlatformMatchesSnapshot };
