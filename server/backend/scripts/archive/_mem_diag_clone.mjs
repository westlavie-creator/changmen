#!/usr/bin/env node
/** Simulate one embedded matchMerge snapshot clone cycle (offline sizing). */
import * as db from "@changmen/db";

function cloneJson(value) {
  if (value == null) return value;
  if (typeof structuredClone === "function") return structuredClone(value);
  return JSON.parse(JSON.stringify(value));
}

await db.initLastWrittenIds?.();
const [matchesRaw, bets, timers, clientRows] = await Promise.all([
  db.fetchPlatformMatches(),
  db.fetchPlatformBets(),
  db.fetchLiveTimers(),
  db.fetchClientMatches(),
]);

const memBefore = process.memoryUsage();
const full = {
  matchesRaw: cloneJson(matchesRaw),
  bets: cloneJson(bets),
  timers: cloneJson(timers),
};
const merged = {
  matchesRaw: cloneJson(full.matchesRaw),
  bets: cloneJson(full.bets),
  timers: cloneJson(full.timers),
  clientRows: cloneJson(clientRows),
  alignClientRows: cloneJson(clientRows),
};
const memAfter = process.memoryUsage();

console.log(JSON.stringify({
  oneCycleCloneBytes: {
    matchesRaw: JSON.stringify(matchesRaw).length,
    bets: JSON.stringify(bets).length,
    timers: JSON.stringify(timers).length,
    clientRows: JSON.stringify(clientRows).length,
    totalInput: JSON.stringify({ matchesRaw, bets, timers, clientRows }).length,
  },
  heapDeltaMb: {
    used: Math.round((memAfter.heapUsed - memBefore.heapUsed) / 1048576),
    total: Math.round((memAfter.heapTotal - memBefore.heapTotal) / 1048576),
  },
  rssMb: Math.round(memAfter.rss / 1048576),
}, null, 2));
