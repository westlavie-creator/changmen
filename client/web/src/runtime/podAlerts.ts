export type PodDropAlert = {
  id: string;
  eventId: string;
  sport: string;
  sportId: number;
  league: string;
  home: string;
  away: string;
  starts: number;
  alertedAt: number;
  market: string;
  lineType: string;
  period: number;
  outcome: string;
  points: number | null;
  previous: number;
  current: number;
  nvp: number;
  dropPct: number;
  ways: number | null;
};

export type PodAlertsSnapshot = {
  alerts: PodDropAlert[];
  capturedAt: number;
  href: string;
  gridFound: boolean;
  sourceConnected: boolean;
};

function asRecord(raw: unknown): Record<string, unknown> | null {
  return raw && typeof raw === "object" ? raw as Record<string, unknown> : null;
}

function str(v: unknown): string {
  return String(v ?? "").trim();
}

function num(v: unknown, fallback = 0): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

function optNum(v: unknown): number | null {
  if (v == null || v === "")
    return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

export function parsePodDropAlert(raw: unknown): PodDropAlert | null {
  const row = asRecord(raw);
  if (!row)
    return null;
  const id = str(row.id);
  if (!id)
    return null;
  return {
    id,
    eventId: str(row.eventId),
    sport: str(row.sport),
    sportId: num(row.sportId),
    league: str(row.league),
    home: str(row.home),
    away: str(row.away),
    starts: num(row.starts),
    alertedAt: num(row.alertedAt),
    market: str(row.market),
    lineType: str(row.lineType),
    period: num(row.period),
    outcome: str(row.outcome),
    points: optNum(row.points),
    previous: num(row.previous),
    current: num(row.current),
    nvp: num(row.nvp),
    dropPct: num(row.dropPct),
    ways: optNum(row.ways),
  };
}

export function parsePodAlertsSnapshot(raw: unknown): PodAlertsSnapshot {
  const row = asRecord(raw);
  const alerts: PodDropAlert[] = [];
  if (Array.isArray(row?.alerts)) {
    for (const item of row.alerts) {
      const alert = parsePodDropAlert(item);
      if (alert)
        alerts.push(alert);
    }
  }
  return {
    alerts,
    capturedAt: num(row?.capturedAt),
    href: str(row?.href),
    gridFound: row?.gridFound === true,
    sourceConnected: row?.sourceConnected === true,
  };
}

export function formatPodPeriod(period: number): string {
  if (period === 1)
    return "半场";
  return "全场";
}

export function formatPodOutcome(alert: Pick<PodDropAlert, "outcome" | "points" | "home" | "away" | "lineType">): string {
  const outcome = alert.outcome.toLowerCase();
  const pts = alert.points;
  const line = pts == null ? "" : (pts > 0 ? `+${pts}` : String(pts));
  if (outcome === "over")
    return line ? `大 ${pts}` : "大";
  if (outcome === "under")
    return line ? `小 ${pts}` : "小";
  if (outcome === "home")
    return `${alert.home}${line ? ` ${line}` : ""}`.trim();
  if (outcome === "away")
    return `${alert.away}${line ? ` ${line}` : ""}`.trim();
  if (outcome === "draw")
    return "平";
  return [alert.outcome, line].filter(Boolean).join(" ");
}

export function formatPodDropPct(dropPct: number): string {
  if (!Number.isFinite(dropPct))
    return "—";
  return `${dropPct.toFixed(1)}%`;
}

export function formatPodPrice(n: number): string {
  if (!Number.isFinite(n) || n <= 0)
    return "—";
  return String(Math.round(n * 1000) / 1000);
}

export function formatPodAgo(ts: number, now = Date.now()): string {
  if (!Number.isFinite(ts) || ts <= 0)
    return "—";
  const sec = Math.max(0, Math.floor((now - ts) / 1000));
  if (sec < 60)
    return `${sec}秒前`;
  const min = Math.floor(sec / 60);
  if (min < 60)
    return `${min}分钟前`;
  return `${Math.floor(min / 60)}小时前`;
}

export function isFreshPodAlert(alertedAt: number, now = Date.now(), windowMs = 60_000): boolean {
  return Number.isFinite(alertedAt) && alertedAt > 0 && now - alertedAt <= windowMs;
}
