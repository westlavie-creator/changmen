/**
 * 进程内内存全面诊断 — 供 GET /health/diag（仅 localhost）与 scripts/mem_diag_*.mjs。
 */

import v8 from "node:v8";
import { getRdsWriteQueueStats } from "@changmen/db";
import { getWsForwardStatus } from "@changmen/ws-forward";
import { getMemoryCacheStats } from "../db/store.js";
import store from "../esport-api/store.js";
import { isEmbeddedMatcher } from "./matcher_mode.js";
import { getEsportRequestTimingSnapshot } from "./esport_request_timing.js";

function mb(n) {
  return Math.round(Number(n) / 1048576);
}

export function getProcessMemorySnapshot() {
  const mem = process.memoryUsage();
  const heap = v8.getHeapStatistics();
  const rss = mem.rss;
  const heapUsed = mem.heapUsed;
  return {
    rssMb: mb(rss),
    heapUsedMb: mb(heapUsed),
    heapTotalMb: mb(mem.heapTotal),
    externalMb: mb(mem.external),
    arrayBuffersMb: mb(mem.arrayBuffers ?? 0),
    nonHeapMb: mb(Math.max(0, rss - heapUsed)),
    heapLimitMb: mb(heap.heap_size_limit),
    mallocedMb: mb(heap.malloced_memory),
    peakMallocedMb: mb(heap.peak_malloced_memory),
    nativeContextCount: heap.number_of_native_contexts,
    detachedContextCount: heap.number_of_detached_contexts,
  };
}

export async function buildMemoryDiagSnapshot() {
  const mem = getProcessMemorySnapshot();
  const collector = store.getCollectorMemoryStats?.() ?? null;
  const dbCache = getMemoryCacheStats();
  const rdsWrite = getRdsWriteQueueStats();
  const ws = getWsForwardStatus();
  const esportApi = getEsportRequestTimingSnapshot();

  let matcherLoop = null;
  let matcherRdsCache = null;
  try {
    ({ getMatcherLoopState } = await import("../../../matcher/loop.js"));
    matcherLoop = getMatcherLoopState();
  }
  catch {
    /* matcher not loaded */
  }
  try {
    ({ getMatcherRdsSnapshotCacheStats } = await import("../../../matcher/ops/rds_snapshot_cache.js"));
    matcherRdsCache = getMatcherRdsSnapshotCacheStats();
  }
  catch {
    /* ignore */
  }

  const wsActive = Object.values(ws.platformStats || {}).reduce(
    (n, s) => n + (s.active || 0),
    0,
  );
  const wsTotalEver = Object.values(ws.platformStats || {}).reduce(
    (n, s) => n + (s.totalConnections || 0),
    0,
  );

  const approxHeapDataMb = Math.round(
    ((collector?.approxJsonBytes?.matches ?? 0)
      + (collector?.approxJsonBytes?.bets ?? 0)
      + (collector?.approxJsonBytes?.timers ?? 0)
      + (dbCache?.approxJsonBytes?.clientMatches ?? 0))
    / 1048576,
  );

  return {
    at: Date.now(),
    uptimeSec: Math.floor(process.uptime()),
    pid: process.pid,
    embeddedMatcher: isEmbeddedMatcher(),
    memory: mem,
    approxHeapDataMb,
    collector,
    dbCache,
    rdsWrite,
    wsForward: {
      enabled: ws.enabled,
      platforms: ws.platforms,
      platformStats: ws.platformStats,
      activeTotal: wsActive,
      totalConnectionsEver: wsTotalEver,
    },
    matcherLoop,
    matcherRdsCache,
    esportApi: {
      counter: esportApi.counter,
      lastAction: esportApi.lastAction,
      lastDelayMs: esportApi.lastDelayMs,
      topByCount: [...esportApi.byAction]
        .sort((a, b) => b.count - a.count)
        .slice(0, 10)
        .map(x => ({ action: x.action, count: x.count, maxMs: x.maxMs, avgMs: x.avgMs })),
    },
  };
}

/** 写 heap snapshot 到 ESPORT_DATA_DIR 或 /tmp，返回文件路径 */
export function writeHeapSnapshotFile(dir = process.env.ESPORT_DATA_DIR || "/tmp") {
  const path = `${dir}/heap-${process.pid}-${Date.now()}.heapsnapshot`;
  v8.writeHeapSnapshot(path);
  return path;
}
