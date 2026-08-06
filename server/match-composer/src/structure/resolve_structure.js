/**
 * 赛制层：Round / RoundStart / BO / periods / decider。
 *
 * 在投影前定型，投影与 shape 只读，不再回头改已投影的 Sources。
 * 真相源：Round/live 来自 timers + OB is_live；BO 只信 OB。
 */
import { findPlatformMatch } from "../sides/orientation_lock.js";

const TIMER_PRIORITY = {
  Polymarket: 100,
  OB: 90,
  RAY: 80,
  IA: 70,
  PB: 60,
  TF: 50,
};

export function liveRound(timers, provider, sourceMatchId) {
  const block = timers?.[provider];
  const arr = block?.timer;
  if (!Array.isArray(arr))
    return { round: 0, roundStart: 0 };
  const sid = String(sourceMatchId);
  const hit = arr.find(x => String(x.matchId ?? x.SourceMatchID ?? x.MatchID ?? "") === sid);
  if (!hit)
    return { round: 0, roundStart: 0 };
  return {
    round: Number(hit.round ?? hit.Round ?? hit.Map ?? hit.roundId ?? 0) || 0,
    roundStart: Number(hit.startTime ?? hit.StartTime ?? hit.RoundStart ?? 0) || 0,
  };
}

export function refreshRoundsFromTimers(rows, timersByProvider) {
  const timers = timersByProvider || {};
  for (const m of rows || []) {
    const linked = Object.entries(m.Matchs || {})
      .map(([provider, sourceId]) => ({
        provider,
        sourceId: String(sourceId),
        pri: TIMER_PRIORITY[provider] || 0,
      }))
      .filter(({ provider }) => Array.isArray(timers?.[provider]?.timer))
      .sort((a, b) => b.pri - a.pri);
    if (!linked.length)
      continue;
    for (const { provider, sourceId } of linked) {
      const hit = liveRound(timers, provider, sourceId);
      if (hit.round > 0) {
        m.Round = hit.round;
        if (hit.roundStart > 0)
          m.RoundStart = hit.roundStart;
        break;
      }
    }
  }
}

function obTimerMatchIds(timersByProvider) {
  const arr = timersByProvider?.OB?.timer;
  if (!Array.isArray(arr))
    return null;
  return new Set(
    arr.map(t => String(t.matchId ?? t.SourceMatchID ?? t.MatchID ?? "")).filter(Boolean),
  );
}

/** OB 非 live / 无 timer → 清 Round */
export function applyObLiveRoundGate(rows, platformMatches, timersByProvider) {
  if (!Array.isArray(rows))
    return;
  const obById = platformMatches?.OB;
  if (!obById || typeof obById !== "object")
    return;
  const timerIds = obTimerMatchIds(timersByProvider);
  for (const m of rows) {
    const obId = m.Matchs?.OB;
    if (obId == null || obId === "")
      continue;
    const sid = String(obId);
    const round = Number(m.Round) || 0;
    const roundStart = Number(m.RoundStart) || 0;
    if (!round && !roundStart)
      continue;
    const row = obById[sid];
    const raw = row?.IsLive ?? row?.is_live;
    if (row == null) {
      m.Round = 0;
      m.RoundStart = 0;
      continue;
    }
    if (raw != null && raw !== "" && Number(raw) !== 2) {
      m.Round = 0;
      m.RoundStart = 0;
      continue;
    }
    if (timerIds != null && !timerIds.has(sid)) {
      m.Round = 0;
      m.RoundStart = 0;
    }
  }
}

/**
 * 决胜局 BO：完全依赖 OB。
 * 无 OB 关联、或 OB.BO≤0 → 返回 0 → 决胜局兜底不触发。
 */
export function resolveRowBo(row, matches) {
  const obSid = row?.Matchs?.OB;
  if (obSid == null || obSid === "" || !matches)
    return 0;
  const pm = findPlatformMatch(matches, "OB", obSid);
  return Number(pm?.BO) || 0;
}

/**
 * 该场应有的局段集合：platform_bets 出现过的 Map ∪ {0} ∪ 决胜局。
 * @returns {number[]} 升序
 */
export function collectPeriods(row, bets, deciderMap = 0) {
  const set = new Set([0]);
  for (const [platform, sourceMatchId] of Object.entries(row?.Matchs || {})) {
    const block = bets?.[`${platform}:${sourceMatchId}`];
    const list = Array.isArray(block) ? block : (block?.bets || []);
    for (const b of list)
      set.add(Number(b.Map) || 0);
  }
  if (Number(deciderMap) > 0)
    set.add(Number(deciderMap));
  return [...set].sort((a, b) => a - b);
}

/**
 * 单行赛制：投影层在 pipeline 之外被直接调用时也走这里，保证只有一套推导。
 * @returns {{ bo: number, deciderMap: number, periods: number[] }}
 */
export function resolveRowStructure(row, { matches, bets } = {}) {
  const bo = resolveRowBo(row, matches);
  const round = Number(row?.Round) || 0;
  const deciderMap = round > 0 && bo > 0 && round === bo ? round : 0;
  return { bo, deciderMap, periods: collectPeriods(row, bets, deciderMap) };
}

/**
 * L2 入口：必须在 projectList 之前调用。
 *
 * `row.BO` 的唯一权威写入点：聚类/reconcile/dedupe 推导出的 BO 只作为该阶段
 * 内部信号（`boConflict` 合场否决），到这里一律被 OB 的值覆盖，
 * 保证落库、UI 与决胜局判定用的是同一个数。
 */
export function resolveMatchStructure(rows, { matches, timers, bets } = {}) {
  refreshRoundsFromTimers(rows, timers);
  applyObLiveRoundGate(rows, matches, timers);
  for (const row of rows || []) {
    const { bo, deciderMap, periods } = resolveRowStructure(row, { matches, bets });
    row.BO = bo;
    row._deciderMap = deciderMap;
    row._periods = periods;
  }
  return rows;
}
