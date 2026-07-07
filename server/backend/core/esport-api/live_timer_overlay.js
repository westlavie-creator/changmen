/**
 * Client_GetMatchs 读取路径：用 live_timers（内存 + RDS）覆盖 client_matches 的 Round/RoundStart。
 * OB 浏览器 saveLiveTimer 写入后端 memory _timers；overlay 在 matcher matchMerge（约 30s）前即时修正 Round。
 */

import {
  applyObLiveRoundGate,
  ensureMapZeroForLiveRound,
  liveRound,
  promoteFullMatchSourcesToLiveRound,
  promoteFullMatchSourcesToLiveRoundInPlace,
  refreshClientMatchRoundsFromTimers,
  trimMapZeroToObOnDeciderRound,
} from "@changmen/match-engine";

export { liveRound };

/** 内存 _timers 覆盖 RDS 同平台快照；空数组不覆盖 RDS 非空 timer（避免误 wipe） */
export function mergeTimerBlocks(memoryTimers, dbTimers) {
  const out = { ...(dbTimers || {}) };
  for (const [platform, block] of Object.entries(memoryTimers || {})) {
    if (block && Array.isArray(block.timer)) {
      if (block.timer.length === 0 && (out[platform]?.timer?.length ?? 0) > 0)
        continue;
      out[platform] = block;
    }
  }
  return out;
}

export function overlayLiveTimersOnMatches(matches, timersByProvider, enrich = {}) {
  if (!Array.isArray(matches) || !matches.length)
    return matches || [];
  const out = matches.map(m => ({
    ...m,
    Bets: (m.Bets || []).map(b => ({
      ...b,
      Sources: { ...(b.Sources || {}) },
    })),
  }));
  refreshClientMatchRoundsFromTimers(out, timersByProvider || {});
  const hasEnrich = enrich.matches && enrich.bets && enrich.sourceFromBet;
  if (hasEnrich) {
    ensureMapZeroForLiveRound(
      out,
      enrich.matches,
      enrich.bets,
      timersByProvider || {},
      enrich.sourceFromBet,
    );
    promoteFullMatchSourcesToLiveRound(
      out,
      enrich.matches,
      enrich.bets,
      timersByProvider || {},
      enrich.sourceFromBet,
    );
  }
  else {
    promoteFullMatchSourcesToLiveRoundInPlace(out, enrich.matches || {});
  }
  trimMapZeroToObOnDeciderRound(out);
  return out;
}

/** is_live≠2、已不在 OB index、或已不在 OB timer 批次时清零（配合 overlay 清已结束场） */
export function applyObLiveGate(matches, memoryMatches, timersByProvider) {
  return applyObLiveRoundGate(matches, memoryMatches, timersByProvider);
}
