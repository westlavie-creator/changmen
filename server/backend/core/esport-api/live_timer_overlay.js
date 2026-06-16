/**
 * Client_GetMatchs 读取路径：用 live_timers（内存 + RDS）覆盖 client_matches 的 Round/RoundStart。
 * OB 浏览器 saveLiveTimer 写入后端 memory _timers；overlay 在 matcher rebuild（约 30s）前即时修正 Round。
 */

import {
  applyObLiveRoundGate,
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

/** is_live≠2、已不在 OB index、或已不在 OB timer 批次时清零（配合 overlay 清已结束场） */
export function applyObLiveGate(matches, memoryMatches, timersByProvider) {
  return applyObLiveRoundGate(matches, memoryMatches, timersByProvider);
}
