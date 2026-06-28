import * as db from "@changmen/db";

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

async function readCached(key, meta, reader) {
  const sig = metaKey(meta);
  const cur = entries.get(key);
  if (cur && sig && cur.sig === sig) {
    cur.hits++;
    return cloneSnapshot(cur.value);
  }

  const value = await reader();
  if ((Number(meta?.count) || 0) > 0 && snapshotEmpty(value)) {
    entries.delete(key);
    return cloneSnapshot(value);
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

export async function fetchMatcherRdsSnapshot() {
  const [platformMeta, clientMeta] = await Promise.all([
    db.fetchPlatformCollectorMeta(),
    db.fetchClientMatchesMeta(),
  ]);

  const [matchesRaw, bets, timers, clientRows] = await Promise.all([
    readCached("platformMatches", platformMeta?.platformMatches, db.fetchPlatformMatches),
    readCached("platformBets", platformMeta?.platformBets, db.fetchPlatformBets),
    readCached("liveTimers", platformMeta?.liveTimers, db.fetchLiveTimers),
    readCached("clientMatches", clientMeta, db.fetchClientMatches),
  ]);

  logCacheStats();
  return {
    matchesRaw,
    bets,
    timers,
    clientRows: clientRows || [],
    alignClientRows: clientRows || [],
  };
}
