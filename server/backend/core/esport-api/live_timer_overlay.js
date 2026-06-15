/**
 * Client_GetMatchs 读取路径：用 live_timers（内存 + RDS）覆盖 client_matches 的 Round/RoundStart。
 * OB 浏览器 saveLiveTimer 写入后端内存 _timers；overlay 在 matcher rebuild（约 30s）前即时修正 Round。
 */

import {
  liveRound,
  refreshClientMatchRoundsFromTimers,
} from "@changmen/match-engine";

export { liveRound };

/** 内存 _timers 覆盖 RDS 同平台快照（含空数组 = 该平台当前无 live 场） */
export function mergeTimerBlocks(memoryTimers, dbTimers) {
  const out = { ...(dbTimers || {}) };
  for (const [platform, block] of Object.entries(memoryTimers || {})) {
    if (block && Array.isArray(block.timer)) out[platform] = block;
  }
  return out;
}

export function overlayLiveTimersOnMatches(matches, timersByProvider) {
  if (!Array.isArray(matches) || !matches.length) return matches || [];
  const out = matches.map((m) => ({ ...m }));
  refreshClientMatchRoundsFromTimers(out, timersByProvider || {});
  return out;
}

function obTimerMatchIds(timersByProvider) {
  const arr = timersByProvider?.OB?.timer;
  if (!Array.isArray(arr)) return null;
  return new Set(
    arr.map((t) => String(t.matchId ?? t.SourceMatchID ?? t.MatchID ?? "")).filter(Boolean),
  );
}

/** is_live≠2 或已不在 OB timer 批次时清零（配合 overlay「未命中保留」清已结束场） */
export function applyObLiveGate(matches, memoryMatches, timersByProvider) {
  if (!Array.isArray(matches)) return matches;
  const obById = memoryMatches?.OB;
  if (!obById || typeof obById !== "object") return matches;
  const timerIds = obTimerMatchIds(timersByProvider);
  return matches.map((m) => {
    const obId = m.Matchs?.OB;
    if (obId == null || obId === "") return m;
    const sid = String(obId);
    const row = obById[sid];
    const raw = row?.IsLive ?? row?.is_live;
    if (Number(raw) === 2) return m;
    const round = Number(m.Round) || 0;
    const roundStart = Number(m.RoundStart) || 0;
    if (!round && !roundStart) return m;
    const explicitNotLive = raw != null && raw !== "" && Number(raw) !== 2;
    const droppedFromTimer =
      timerIds && timerIds.size > 0 && !timerIds.has(sid);
    if (!explicitNotLive && !droppedFromTimer) return m;
    return { ...m, Round: 0, RoundStart: 0 };
  });
}
