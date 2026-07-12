export interface MlbRuns {
  away: number;
  home: number;
}

export interface MlbSportLive {
  gameId?: number;
  slug?: string;
  homeTeam?: string;
  awayTeam?: string;
  status?: string;
  live?: boolean;
  ended?: boolean;
  period?: string;
  scoreRaw?: string;
  runs: MlbRuns;
  label: string;
  updatedAt: number;
}

export interface MlbSportWsMessage {
  gameId?: number;
  leagueAbbreviation?: string;
  slug?: string;
  homeTeam?: string;
  awayTeam?: string;
  status?: string;
  score?: string;
  period?: string;
  live?: boolean;
  ended?: boolean;
  elapsed?: string;
}

const PERIOD_LABELS: Record<string, string> = {
  VFT: "完场",
  END: "完场",
  FINAL: "完场",
  PRE: "未开始",
  DELAY: "延期",
};

function parseMlbRuns(score: string | undefined): MlbRuns {
  const raw = String(score ?? "").trim();
  const head = raw.split("|")[0] ?? raw;
  const nums = head.split("-").map(v => Number.parseInt(v, 10));
  const away = Number.isFinite(nums[0]) ? nums[0] : 0;
  const home = Number.isFinite(nums[1]) ? nums[1] : 0;
  return { away, home };
}

function formatPeriod(period: string | undefined): string {
  const raw = String(period ?? "").trim();
  if (!raw)
    return "";
  const upper = raw.toUpperCase();
  if (PERIOD_LABELS[upper])
    return PERIOD_LABELS[upper];

  const inning = /^(TOP|BOT|MID)(\d+)$/i.exec(upper);
  if (inning) {
    const half = inning[1] === "TOP" ? "上" : inning[1] === "BOT" ? "下" : "中";
    return `${inning[2]}局${half}`;
  }
  return raw;
}

function formatStatus(msg: MlbSportWsMessage, runs: MlbRuns): string {
  const st = String(msg.status ?? "").toLowerCase();
  const scoreText = `${runs.away}-${runs.home}`;
  const periodText = formatPeriod(msg.period);

  if (msg.ended || st === "finished" || st === "final")
    return periodText ? `已结束 · ${scoreText} · ${periodText}` : `已结束 · ${scoreText}`;
  if (st === "postponed")
    return "延期";
  if (st === "canceled" || st === "cancelled")
    return "取消";
  if (st === "not_started" || st === "scheduled")
    return "未开始";
  if (msg.live || st === "running" || st === "inprogress") {
    if (periodText)
      return `进行中 · ${periodText} · ${scoreText}`;
    return `进行中 · ${scoreText}`;
  }
  if (msg.status)
    return `${msg.status} · ${scoreText}`;
  return scoreText;
}

export function parseMlbSportMessage(msg: MlbSportWsMessage): MlbSportLive | null {
  const league = String(msg.leagueAbbreviation ?? "").toLowerCase();
  const slug = String(msg.slug ?? "").trim();
  if (league !== "mlb" && !slug.startsWith("mlb-"))
    return null;

  const runs = parseMlbRuns(msg.score);
  const label = formatStatus(msg, runs);

  return {
    gameId: msg.gameId != null ? Number(msg.gameId) : undefined,
    slug: slug || undefined,
    homeTeam: msg.homeTeam ? String(msg.homeTeam) : undefined,
    awayTeam: msg.awayTeam ? String(msg.awayTeam) : undefined,
    status: msg.status ? String(msg.status) : undefined,
    live: msg.live === true,
    ended: msg.ended === true || String(msg.status ?? "").toLowerCase() === "final",
    period: msg.period ? String(msg.period) : undefined,
    scoreRaw: msg.score ? String(msg.score) : undefined,
    runs,
    label,
    updatedAt: Date.now(),
  };
}

export function sportLookupKey(snapshot: MlbSportLive): string {
  if (snapshot.slug)
    return `slug:${snapshot.slug}`;
  if (snapshot.gameId != null && Number.isFinite(snapshot.gameId))
    return `game:${snapshot.gameId}`;
  return "";
}

export function eventLookupKeys(event: { slug?: string; gameId?: number }): string[] {
  const keys: string[] = [];
  if (event.slug)
    keys.push(`slug:${event.slug}`);
  if (event.gameId != null && Number.isFinite(event.gameId))
    keys.push(`game:${event.gameId}`);
  return keys;
}
