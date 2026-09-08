import type { ViewMatch } from "@/models/match";
import { footballLeagueKey, footballLeagueLabel } from "@/runtime/footballLeague";

/** 足球页 OB 未开赛窗口：现在起未来 2 小时（今日菜单场次太多，必须裁） */
export const FOOTBALL_UPCOMING_MS = 2 * 3600 * 1000;
/** 已开赛保留：足球 90 分钟+中场+补时，按开赛后 4 小时内仍算进行中 */
export const FOOTBALL_LIVE_LOOKBACK_MS = 4 * 3600 * 1000;

const OUTCOME_LABEL_RE = /^(大|小|大球|小球|over|under|o\/u)$/i;
const OB_PROVIDER_RE = /^OB/i;

/** 合场把大小球选项当成队名时的脏标题 */
export function isFootballJunkMatchTitle(title: string): boolean {
  const parts = String(title || "").split(/\s+vs\.?\s+/i);
  if (parts.length < 2)
    return false;
  const home = parts[0].trim();
  const away = parts.slice(1).join(" vs ").trim();
  return OUTCOME_LABEL_RE.test(home) && OUTCOME_LABEL_RE.test(away);
}

export function matchInUpcomingWindow(
  startAt: number,
  now = Date.now(),
  horizonMs = FOOTBALL_UPCOMING_MS,
  lookbackMs = FOOTBALL_LIVE_LOOKBACK_MS,
): boolean {
  const t = Number(startAt) || 0;
  if (!(t > 0))
    return false;
  return t >= now - lookbackMs && t <= now + horizonMs;
}

/** 仅 OB 场次走 2h/滚球窗口。PM/PF 服务端已是 24h 过去 + 7 天未来，不再二次裁。 */
export function matchUsesObUpcomingWindow(match: ViewMatch): boolean {
  const keys = Object.keys(match.providers || {}).map(k => String(k).trim()).filter(Boolean);
  if (!keys.length)
    return true;
  return keys.every(k => OB_PROVIDER_RE.test(k));
}

export function matchMatchesSearch(match: ViewMatch, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q)
    return true;
  if (String(match.id).includes(q))
    return true;
  if (String(match.title || "").toLowerCase().includes(q))
    return true;
  if (String(match.game || "").toLowerCase().includes(q))
    return true;
  if (footballLeagueLabel(match.game).toLowerCase().includes(q))
    return true;
  if (footballLeagueLabel(footballLeagueKey(match.game)).toLowerCase().includes(q))
    return true;
  return match.bets.some(
    b => String(b.homeName || "").toLowerCase().includes(q)
      || String(b.awayName || "").toLowerCase().includes(q),
  );
}

/** 开赛时间升序；同刻按 id，保证列表稳定。 */
export function sortSportBoardMatchesByStartTime(matches: ViewMatch[]): ViewMatch[] {
  return [...matches].sort((a, b) => {
    const ta = Number(a.startAt) || 0;
    const tb = Number(b.startAt) || 0;
    if (ta !== tb)
      return ta - tb;
    return (Number(a.id) || 0) - (Number(b.id) || 0);
  });
}

/**
 * 默认：OB 未来 2 小时未开赛 + 开赛后 4 小时内（滚球）；PM/PF 不裁窗口。
 * 有搜索词时不裁窗口。结果按开赛时间排序。
 */
export function filterSportBoardMatches(
  matches: ViewMatch[],
  opts: {
    query?: string;
    horizonMs?: number;
    lookbackMs?: number;
    now?: number;
  } = {},
): ViewMatch[] {
  const list = (Array.isArray(matches) ? matches : [])
    .filter(m => !isFootballJunkMatchTitle(String(m.title || "")));
  const q = String(opts.query || "").trim();
  const searched = !q ? list : list.filter(m => matchMatchesSearch(m, q));
  if (q)
    return sortSportBoardMatchesByStartTime(searched);
  const horizon = Number(opts.horizonMs);
  if (!(horizon > 0))
    return sortSportBoardMatchesByStartTime(searched);
  const now = opts.now ?? Date.now();
  const lookback = opts.lookbackMs ?? FOOTBALL_LIVE_LOOKBACK_MS;
  return sortSportBoardMatchesByStartTime(searched.filter(m => (
    !matchUsesObUpcomingWindow(m)
    || matchInUpcomingWindow(m.startAt, now, horizon, lookback)
  )));
}
