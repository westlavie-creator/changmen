/**
 * Client_GetMatchs 读取路径：用 live_timers（内存 + RDS）覆盖 client_matches 的 Round/RoundStart。
 * OB 浏览器 saveLiveTimer 写入后端内存 _timers；overlay 在 matcher rebuild（约 30s）前即时修正 Round。
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

/** 内存 _timers 覆盖 RDS 同平台快照（含空数组 = 该平台当前无 live 场） */
export function mergeTimerBlocks(memoryTimers, dbTimers) {
  const out = { ...(dbTimers || {}) };
  for (const [platform, block] of Object.entries(memoryTimers || {})) {
    if (block && Array.isArray(block.timer)) out[platform] = block;
  }
  return out;
}

function timerSnapshotProviders(match, timersByProvider) {
  return Object.entries(match.Matchs || {})
    .map(([provider, sourceId]) => ({
      provider,
      sourceId,
      pri: PROVIDER_PRIORITY[provider] || 0,
    }))
    .filter(({ provider }) => Array.isArray(timersByProvider?.[provider]?.timer))
    .sort((a, b) => b.pri - a.pri);
}

export function overlayLiveTimersOnMatches(matches, timersByProvider) {
  if (!Array.isArray(matches) || !matches.length) return matches || [];
  if (!timersByProvider || !Object.keys(timersByProvider).length) return matches;

  return matches.map((m) => {
    const linked = timerSnapshotProviders(m, timersByProvider);
    if (!linked.length) return m;

    const { provider, sourceId } = linked[0];
    const { round, roundStart } = liveRound(timersByProvider, provider, sourceId);
    const bestRound = round > 0 ? round : 0;
    const bestStart = round > 0 && roundStart > 0 ? roundStart : 0;

    if (bestRound === (Number(m.Round) || 0) && bestStart === (Number(m.RoundStart) || 0)) {
      return m;
    }
    return { ...m, Round: bestRound, RoundStart: bestStart };
  });
}
