/**
 * @deprecated Client_GetMatchs 不再调用 overlay；Round/promote/trim 由 matchMerge finalize 写入 client_matches。
 * 本模块保留 mergeTimerBlocks 供单元测试与历史对照；新逻辑请用 match-engine finalizeClientMatchListAfterLinks。
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

/** @deprecated 读路径已停用；行为由 match-engine 测试覆盖 */
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

/** @deprecated 读路径已停用 */
export function applyObLiveGate(matches, memoryMatches, timersByProvider) {
  return applyObLiveRoundGate(matches, memoryMatches, timersByProvider);
}
