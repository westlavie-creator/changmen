/**
 * Round / promote / trim / gate / strip — 自研精简版（不调用 match_merge finalize）。
 */
import { parseTitleTeams } from "@changmen/match-engine/teams/match_utils.js";
import { findPlatformMatch } from "../sides/orientation_lock.js";

const MIN_PLATFORMS = 2;

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

/**
 * 决胜局 BO：完全依赖 OB。
 * 无 OB 关联、或 OB.BO≤0 → 返回 0 → promote 不触发。
 */
export function resolveRowBo(row, matches) {
  const obSid = row?.Matchs?.OB;
  if (obSid == null || obSid === "" || !matches)
    return 0;
  const pm = findPlatformMatch(matches, "OB", obSid);
  return Number(pm?.BO) || 0;
}

export function preserveInitialOddsFromSources(bet) {
  if (!bet)
    return;
  let home = Number(bet.InitialHomeOdds) || 0;
  let away = Number(bet.InitialAwayOdds) || 0;
  for (const src of Object.values(bet.Sources || {})) {
    if (!src)
      continue;
    home = Math.max(home, Number(src.HomeOdds) || 0);
    away = Math.max(away, Number(src.AwayOdds) || 0);
  }
  if (home > 0)
    bet.InitialHomeOdds = home;
  if (away > 0)
    bet.InitialAwayOdds = away;
}

/**
 * 决胜局：Map0 → Map=R；仅 Round===OB.BO 且无原生不同盘口时复制；禁止二次 swap。
 * 无 OB 或 OB.BO≤0 时不 promote。
 */
export function promoteMap0ToDecider(rows, matches = {}) {
  for (const row of rows || []) {
    const liveMap = Number(row.Round) || 0;
    const bo = resolveRowBo(row, matches);
    if (liveMap <= 0 || bo <= 0 || liveMap !== bo)
      continue;
    const fullBet = (row.Bets || []).find(b => (Number(b.Map) || 0) === 0);
    if (!fullBet?.Sources)
      continue;
    let liveBet = (row.Bets || []).find(b => (Number(b.Map) || 0) === liveMap);
    if (!liveBet) {
      liveBet = {
        Map: liveMap,
        Name: `[地图${liveMap}]-单局-获胜`,
        MatchID: row.ID,
        Sources: {},
      };
      row.Bets = row.Bets || [];
      row.Bets.push(liveBet);
    }
    for (const [platform, fullSrc] of Object.entries(fullBet.Sources)) {
      const liveSrc = liveBet.Sources?.[platform];
      // 已有原生 Map=R 且 BetID 不同 → 保留原生，不覆盖
      if (liveSrc && String(liveSrc.BetID || "") && String(liveSrc.BetID || "") !== String(fullSrc.BetID || ""))
        continue;
      liveBet.Sources = liveBet.Sources || {};
      liveBet.Sources[platform] = { ...fullSrc };
    }
  }
}

/** live Round>0：Map0 仅保留 OB / Polymarket；trim 前保全 Initial* */
export function trimMapZeroLive(rows) {
  for (const row of rows || []) {
    const liveMap = Number(row.Round) || 0;
    if (liveMap <= 0)
      continue;
    const fullBet = (row.Bets || []).find(b => (Number(b.Map) || 0) === 0);
    if (!fullBet)
      continue;
    preserveInitialOddsFromSources(fullBet);
    const kept = {};
    if (fullBet.Sources?.OB)
      kept.OB = fullBet.Sources.OB;
    if (fullBet.Sources?.Polymarket)
      kept.Polymarket = fullBet.Sources.Polymarket;
    fullBet.Sources = kept;
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

export function stripOrphanPlatforms(rows, platformMatches) {
  for (const row of rows || []) {
    if (row?.Matchs && typeof row.Matchs === "object") {
      for (const [plat, srcId] of Object.entries({ ...row.Matchs })) {
        if (!findPlatformMatch(platformMatches, plat, srcId))
          delete row.Matchs[plat];
      }
    }
    if (!Array.isArray(row?.Bets))
      continue;
    for (const bet of row.Bets) {
      if (!bet?.Sources)
        continue;
      for (const plat of Object.keys(bet.Sources)) {
        const srcId = row.Matchs?.[plat];
        if (!srcId || !findPlatformMatch(platformMatches, plat, srcId))
          delete bet.Sources[plat];
      }
    }
    row.Bets = row.Bets.filter((b) => {
      if (Object.keys(b.Sources || {}).length > 0)
        return true;
      const map = Number(b.Map) || 0;
      if (map !== 0)
        return false;
      const liveMap = Number(row.Round) || 0;
      if (liveMap <= 0)
        return false;
      return (Number(b.InitialHomeOdds) || 0) > 0 || (Number(b.InitialAwayOdds) || 0) > 0;
    });
    const platformsWithSources = new Set();
    for (const bet of row.Bets || []) {
      for (const p of Object.keys(bet.Sources || {}))
        platformsWithSources.add(p);
    }
    if (Array.isArray(row.Reverse))
      row.Reverse = row.Reverse.filter(p => platformsWithSources.has(p));
  }
}

export function refreshBetNames(rows) {
  for (const row of rows || []) {
    const teams = parseTitleTeams(row.Title);
    for (const bet of row.Bets || []) {
      if (teams) {
        bet.HomeName = teams.home;
        bet.AwayName = teams.away;
      }
      const map = Number(bet.Map) || 0;
      if (!bet.Name) {
        bet.Name = map === 0 ? "全场-获胜" : `[地图${map}]-单局-获胜`;
      }
      if (row.ID != null)
        bet.MatchID = Number(row.ID);
    }
  }
}

export function sortBets(rows) {
  for (const row of rows || []) {
    if (!Array.isArray(row.Bets) || row.Bets.length < 2)
      continue;
    row.Bets.sort((a, b) => (Number(a.Map) || 0) - (Number(b.Map) || 0));
  }
}

/** strip 后仍不足多馆的场剔除；进行中（Round>0）允许暂留单馆，避免源抖动误归档 */
export function filterMultiPlatform(rows, minPlatforms = MIN_PLATFORMS) {
  const min = Math.max(1, Number(minPlatforms) || MIN_PLATFORMS);
  return (rows || []).filter((r) => {
    const n = Object.keys(r?.Matchs || {}).length;
    if (n >= min)
      return true;
    // live：至少还剩 1 馆则保留，等缺席馆恢复
    if (n >= 1 && (Number(r?.Round) || 0) > 0)
      return true;
    return false;
  });
}

/**
 * 投影后：gate → promote/trim → strip → 多馆门槛的顺序更稳：
 * 先 gate 清伪 Round，再 promote/trim，避免短暂闪空。
 */
export function applyLiveShape(rows, { matches, timers } = {}) {
  refreshRoundsFromTimers(rows, timers);
  applyObLiveRoundGate(rows, matches, timers);
  promoteMap0ToDecider(rows, matches);
  trimMapZeroLive(rows);
  stripOrphanPlatforms(rows, matches);
  refreshBetNames(rows);
  sortBets(rows);
  return rows;
}
