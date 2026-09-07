import type { ViewMatch } from "@/models/match";

/** 足球页默认开赛窗口：现在起 6 小时内 */
export const FOOTBALL_UPCOMING_MS = 6 * 3600 * 1000;
/** 已开赛约 2h 内仍算进行中，避免滚球从默认列表消失 */
export const FOOTBALL_LIVE_LOOKBACK_MS = 2 * 3600 * 1000;

const OUTCOME_LABEL_RE = /^(大|小|大球|小球|over|under|o\/u)$/i;

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
  return match.bets.some(
    b => String(b.homeName || "").toLowerCase().includes(q)
      || String(b.awayName || "").toLowerCase().includes(q),
  );
}

/**
 * 默认按开赛窗口裁剪；有搜索词时搜全部（可找到 6 小时以外的场）。
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
    return searched;
  const horizon = Number(opts.horizonMs);
  if (!(horizon > 0))
    return searched;
  const now = opts.now ?? Date.now();
  const lookback = opts.lookbackMs ?? FOOTBALL_LIVE_LOOKBACK_MS;
  return searched.filter(m => matchInUpcomingWindow(m.startAt, now, horizon, lookback));
}
