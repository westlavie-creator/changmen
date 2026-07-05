/** 进程内 esport API 耗时采样，供 /health 与管理端诊断（对齐前端 Ut.delay 观测面） */

const MAX_SLOW_RECENT = 15;
const SLOW_THRESHOLD_MS = 500;
const MAX_ACTION_STATS = 16;

let counter = 0;
let lastDelayMs = 0;
let lastAction = "";
let lastAt = 0;

/** @type {Map<string, { count: number, sumMs: number, maxMs: number, lastMs: number, lastAt: number }>} */
const byAction = new Map();

/** @type {{ action: string, durationMs: number, at: number }[]} */
const slowRecent = [];

/**
 * @param {string} action
 * @param {number} durationMs
 */
export function recordEsportRequest(action, durationMs) {
  const name = String(action || "").trim() || "unknown";
  const ms = Math.max(0, Math.round(durationMs));
  const at = Date.now();

  counter += 1;
  lastDelayMs = ms;
  lastAction = name;
  lastAt = at;

  let stat = byAction.get(name);
  if (!stat) {
    stat = { count: 0, sumMs: 0, maxMs: 0, lastMs: 0, lastAt: 0 };
    byAction.set(name, stat);
  }
  stat.count += 1;
  stat.sumMs += ms;
  stat.maxMs = Math.max(stat.maxMs, ms);
  stat.lastMs = ms;
  stat.lastAt = at;

  if (ms >= SLOW_THRESHOLD_MS) {
    slowRecent.unshift({ action: name, durationMs: ms, at });
    if (slowRecent.length > MAX_SLOW_RECENT)
      slowRecent.length = MAX_SLOW_RECENT;
  }
}

export function getEsportRequestTimingSnapshot() {
  const actions = [...byAction.entries()]
    .map(([action, s]) => ({
      action,
      count: s.count,
      avgMs: s.count ? Math.round(s.sumMs / s.count) : 0,
      maxMs: s.maxMs,
      lastMs: s.lastMs,
      lastAt: s.lastAt,
    }))
    .sort((a, b) => b.maxMs - a.maxMs || b.lastAt - a.lastAt)
    .slice(0, MAX_ACTION_STATS);

  return {
    counter,
    lastDelayMs,
    lastAction,
    lastAt,
    slowRecent: slowRecent.map(row => ({ ...row })),
    byAction: actions,
  };
}

/** @internal test helper */
export function resetEsportRequestTimingForTest() {
  counter = 0;
  lastDelayMs = 0;
  lastAction = "";
  lastAt = 0;
  byAction.clear();
  slowRecent.length = 0;
}
