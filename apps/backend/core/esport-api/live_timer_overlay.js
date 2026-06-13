/**
 * Client_GetMatchs 读取路径：用 live_timers（内存 + RDS）覆盖 client_matches 的 Round/RoundStart。
 * OB 浏览器采集 saveLiveTimer 只写 _timers，matcher rebuild 才有 30s 延迟；Electron 依赖本 overlay 即时展示计时器。
 */

const PROVIDER_PRIORITY = {
  OB: 10,
  RAY: 9,
  TF: 8,
  IA: 7,
  IMT: 6,
  IM: 5,
  PB: 4,
  SABA: 3,
  HG: 2,
};

export function liveRound(timers, provider, sourceMatchId) {
  const block = timers?.[provider];
  const arr = block?.timer;
  if (!Array.isArray(arr)) return { round: 0, roundStart: 0 };
  const sid = String(sourceMatchId);
  const hit = arr.find(
    (x) => String(x.matchId ?? x.SourceMatchID ?? x.MatchID ?? "") === sid,
  );
  if (!hit) return { round: 0, roundStart: 0 };
  return {
    round: Number(hit.round ?? hit.Round ?? hit.Map ?? hit.roundId ?? 0) || 0,
    roundStart: Number(hit.startTime ?? hit.StartTime ?? hit.RoundStart ?? 0) || 0,
  };
}

/** 内存 _timers 优先于 RDS 快照（同进程 Electron 内 saveLiveTimer 刚写入） */
export function mergeTimerBlocks(memoryTimers, dbTimers) {
  const out = { ...(dbTimers || {}) };
  for (const [platform, block] of Object.entries(memoryTimers || {})) {
    if (block?.timer?.length) out[platform] = block;
  }
  return out;
}

export function overlayLiveTimersOnMatches(matches, timersByProvider) {
  if (!Array.isArray(matches) || !matches.length) return matches || [];
  if (!timersByProvider || !Object.keys(timersByProvider).length) return matches;

  return matches.map((m) => {
    let bestPri = -1;
    let bestRound = Number(m.Round) || 0;
    let bestStart = Number(m.RoundStart) || 0;

    for (const [provider, sourceId] of Object.entries(m.Matchs || {})) {
      const pri = PROVIDER_PRIORITY[provider] || 0;
      const { round, roundStart } = liveRound(timersByProvider, provider, sourceId);
      if (round <= 0) continue;
      const start = roundStart > 0 ? roundStart : bestStart;
      if (pri >= bestPri) {
        bestPri = pri;
        bestRound = round;
        if (roundStart > 0) bestStart = roundStart;
        else if (!bestStart) bestStart = 0;
      }
    }

    if (bestRound === (Number(m.Round) || 0) && bestStart === (Number(m.RoundStart) || 0)) {
      return m;
    }
    return { ...m, Round: bestRound, RoundStart: bestStart };
  });
}
