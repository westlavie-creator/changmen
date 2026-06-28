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
    throw new Error(`${key} RDS snapshot is empty but meta count=${meta.count}; abort rebuild`);
  }
  if (opts.critical && !meta && snapshotEmpty(value)) {
    if (cur?.value && !snapshotEmpty(cur.value)) {
      console.warn(`[matcher] ${key} RDS meta unavailable and snapshot empty; using previous cache`);
      return cloneSnapshot(cur.value);
    }
    throw new Error(`${key} RDS snapshot is empty and meta unavailable; abort rebuild`);
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

  return {
    matchesRaw: cloneSnapshot(full.matchesRaw),
    bets: cloneSnapshot(full.bets),
    timers: cloneSnapshot(full.timers),
    clientRows: cloneSnapshot(clientRows),
    alignClientRows: cloneSnapshot(clientRows),
    hotCollector: {
      matches: true,
      bets: true,
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
    ? mergeObjectSnapshot(rdsMatchesRaw, hot.matchesRaw)
    : rdsMatchesRaw;
  const bets = hot?.hasBets
    ? mergeObjectSnapshot(rdsBets, hot.bets)
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
