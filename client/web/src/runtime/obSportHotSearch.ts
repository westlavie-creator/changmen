/**
 * 熊猫热搜解析。板上 miss 才打 /yewu11/v1/hotSearch/hotSelect3，不 Playwright。
 */
export const OB_SPORT_HOT_SEARCH_PATH = "/yewu11/v1/hotSearch/hotSelect3";

const SKIP_KEYWORD = new Set(["deportivo", "club", "fc", "sc", "united", "city"]);

export type ObSportSearchHit = {
  mid: string;
  home: string;
  away: string;
  league: string;
  tid: string;
  startTime: number;
};

function asRecord(raw: unknown): Record<string, unknown> | null {
  return raw && typeof raw === "object" && !Array.isArray(raw)
    ? raw as Record<string, unknown>
    : null;
}

function asList(raw: unknown): unknown[] {
  return Array.isArray(raw) ? raw : [];
}

function startTimeMs(raw: unknown): number {
  const n = Number(raw) || 0;
  if (!(n > 0))
    return 0;
  return n > 1e12 ? n : n * 1000;
}

/** AutoYabo extractSearchKeyword：抽最长拉丁词，太短则用原串。 */
export function extractObSportSearchKeyword(name: string): string {
  const raw = String(name || "").trim();
  if (!raw)
    return "";
  const spaced = raw.replace(/-/g, " ");
  const parts = spaced.split(/\s+/).filter(Boolean);
  if (parts.length <= 1)
    return raw;
  const useful = parts.filter(p => !SKIP_KEYWORD.has(p.toLowerCase()));
  const pool = useful.length ? useful : parts;
  let best = "";
  let bestN = 0;
  for (const part of pool) {
    const n = (part.match(/[a-zA-Z]/g) || []).length;
    if (n > bestN) {
      bestN = n;
      best = part;
    }
  }
  return best.length >= 3 ? best : raw;
}

function teamH5Rows(decoded: unknown): Record<string, unknown>[] {
  const root = asRecord(decoded) || {};
  const data = asRecord(root.data) || root;
  const bags = [
    asList(data.teamH5),
    asList(data.teamList),
    asList(data.list),
    asList(data.matches),
    asList(root.teamH5),
    asList(decoded),
  ];
  const out: Record<string, unknown>[] = [];
  for (const bag of bags) {
    for (const row of bag) {
      const rec = asRecord(row);
      if (rec)
        out.push(rec);
    }
  }
  return out;
}

export function parseObSportHotSearch(decoded: unknown): ObSportSearchHit[] {
  const byMid = new Map<string, ObSportSearchHit>();
  for (const row of teamH5Rows(decoded)) {
    const mid = String(row.mid ?? row.matchId ?? row.id ?? "").trim();
    if (!/^\d{4,12}$/.test(mid))
      continue;
    const sport = String(row.csid ?? row.sportType ?? row.st ?? "1");
    if (sport && sport !== "1")
      continue;
    const home = String(row.mhn ?? row.home ?? row.homeTeam ?? "").trim();
    const away = String(row.man ?? row.away ?? row.awayTeam ?? "").trim();
    if (!home || !away)
      continue;
    byMid.set(mid, {
      mid,
      home,
      away,
      league: String(row.tn ?? row.tnjc ?? row.league ?? "").trim(),
      tid: String(row.tid ?? row.tournamentId ?? row.leagueId ?? "").trim(),
      startTime: startTimeMs(row.mgt ?? row.mgtStr ?? row.startTime),
    });
  }
  return [...byMid.values()];
}
