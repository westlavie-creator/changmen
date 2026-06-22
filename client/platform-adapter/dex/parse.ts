import type { CollectMatchDto, CollectBetDto, CollectTeamDto } from "@/types/collect";
import type { PlatformId } from "@/types/esport";
import { PLATFORMS } from "@/shared/platform";

const PLATFORM: PlatformId = PLATFORMS.Dex;

/** DexSport Sportsbook API 基础地址 */
export const DEX_SPORTSBOOK_BASE = "https://prod.dexsport.work";
export const DEX_SPORTSBOOK_API = `${DEX_SPORTSBOOK_BASE}/api/sportsbook`;
export const DEX_CONTENT_API = `${DEX_SPORTSBOOK_BASE}/api/content`;

/** DexSport 电竞 discipline slugs → changmen SourceGameID */
export const DEX_ESPORT_SLUGS: Record<string, string> = {
  dota2: "dota2",
  csgo: "csgo",
  lol: "lol",
  valorant: "valorant",
  "king-of-glory": "king-of-glory",
};

export function dexSportSlugs(): string[] {
  return Object.keys(DEX_ESPORT_SLUGS);
}

export interface DexEvent {
  id: string;
  slug: string;
  status: string;
  startTime: number;
  home: string;
  away: string;
  homeId: string;
  awayId: string;
  disciplineSlug: string;
}

export interface DexMarket {
  id: string;
  name: string;
  status: string;
  outcomes: Array<{
    id: string;
    name: string;
    odds: number;
    status: string;
  }>;
}

export function parseScheduleEvents(
  disciplineSlug: string,
  data: unknown,
): DexEvent[] {
  const events: DexEvent[] = [];
  const list = Array.isArray(data) ? data : (data as Record<string, unknown>)?.events;
  if (!Array.isArray(list)) return events;

  for (const ev of list) {
    if (!ev || typeof ev !== "object") continue;
    const raw = ev as Record<string, unknown>;
    const status = String(raw.status ?? "");
    if (!["live", "prematch", "active"].includes(status)) continue;

    const competitors = (raw.competitors ?? raw.teams ?? []) as Array<Record<string, unknown>>;
    if (competitors.length < 2) continue;

    const home = competitors[0]!;
    const away = competitors[1]!;
    const homeName = String(home.name ?? home.title ?? "");
    const awayName = String(away.name ?? away.title ?? "");
    if (!homeName || !awayName) continue;

    const startTime = Number(raw.startTime ?? raw.start_time ?? 0);

    events.push({
      id: String(raw.id ?? ""),
      slug: String(raw.slug ?? ""),
      status,
      startTime: startTime > 1e12 ? startTime : startTime * 1000,
      home: homeName,
      away: awayName,
      homeId: String(home.id ?? home.extId ?? ""),
      awayId: String(away.id ?? away.extId ?? ""),
      disciplineSlug,
    });
  }
  return events;
}

export function dexEventToMatch(ev: DexEvent): CollectMatchDto {
  const gameId = DEX_ESPORT_SLUGS[ev.disciplineSlug] || ev.disciplineSlug;
  const teamHome: CollectTeamDto = {
    Type: PLATFORM,
    TeamID: ev.homeId,
    Name: ev.home,
    GameID: gameId,
    Logo: "",
  };
  const teamAway: CollectTeamDto = {
    Type: PLATFORM,
    TeamID: ev.awayId,
    Name: ev.away,
    GameID: gameId,
    Logo: "",
  };
  return {
    Type: PLATFORM,
    SourceMatchID: ev.id,
    SourceGameID: gameId,
    StartTime: ev.startTime,
    HomeID: ev.homeId,
    Home: ev.home,
    AwayID: ev.awayId,
    Away: ev.away,
    Teams: [teamHome, teamAway],
  };
}

export function parseMarketsToBets(
  matchId: string,
  data: unknown,
): CollectBetDto[] {
  const bets: CollectBetDto[] = [];
  const markets = Array.isArray(data) ? data : (data as Record<string, unknown>)?.markets;
  if (!Array.isArray(markets)) return bets;

  for (const mkt of markets) {
    if (!mkt || typeof mkt !== "object") continue;
    const raw = mkt as Record<string, unknown>;
    const outcomes = (raw.outcomes ?? []) as Array<Record<string, unknown>>;
    if (outcomes.length !== 2) continue;

    const locked = raw.status !== "active" && raw.status !== "open";
    const home = outcomes[0]!;
    const away = outcomes[1]!;
    const homeOdds = !locked ? Number(home.odds ?? 0) : 0;
    const awayOdds = !locked ? Number(away.odds ?? 0) : 0;

    const name = String(raw.name ?? raw.caption ?? "");
    const map = parseMapFromMarketName(name);

    bets.push({
      Type: PLATFORM,
      SourceMatchID: matchId,
      Map: map,
      SourceBetID: String(raw.id ?? ""),
      BetName: name,
      SourceHomeID: String(home.id ?? ""),
      HomeName: String(home.name ?? ""),
      HomeOdds: homeOdds,
      SourceAwayID: String(away.id ?? ""),
      AwayName: String(away.name ?? ""),
      AwayOdds: awayOdds,
      Status: locked ? "Locked" : "Normal",
    });
  }
  return bets;
}

function parseMapFromMarketName(name: string): number {
  const lower = name.toLowerCase();
  if (/map\s*1\b/.test(lower)) return 1;
  if (/map\s*2\b/.test(lower)) return 2;
  if (/map\s*3\b/.test(lower)) return 3;
  if (/map\s*4\b/.test(lower)) return 4;
  if (/map\s*5\b/.test(lower)) return 5;
  if (/winner|match|result/i.test(lower)) return 0;
  return 0;
}
