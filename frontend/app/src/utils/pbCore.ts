/** 对齐 backend/platforms/pb/pb_core.js / A8 bundle PZe */

export function slugify(text: string): string {
  return String(text || "")
    .toLowerCase()
    .replace(/\s/g, "-");
}

export function selectionId(matchId: string | number, map: number, side: "HOME" | "AWAY"): string {
  const homeBit = side === "HOME" ? 0 : 1;
  return [matchId, map, 1, homeBit, 0, 0, homeBit].join("|");
}

export function toNumber(value: unknown): number {
  if (value == null) return 0;
  if (typeof value === "number") return value;
  if (typeof value === "string") return Number(value) || 0;
  if (typeof value === "object" && value !== null && typeof (value as { toNumber?: () => number }).toNumber === "function") {
    return (value as { toNumber: () => number }).toNumber();
  }
  return Number(value) || 0;
}

function periodLabel(map: number): string {
  return map === 0 ? "全场" : `地图${map}`;
}

export function betNameForMap(map: number): string {
  return `[${periodLabel(map)}]-比赛胜负`;
}

function isLocked(moneyLine: Record<string, unknown> | undefined): boolean {
  if (!moneyLine) return true;
  return Boolean(moneyLine.offline || moneyLine.unavailable);
}

function isKillsSide(participant: Record<string, unknown> | undefined): boolean {
  return /\(Kills\)/i.test(String(participant?.englishName || participant?.name || ""));
}

function inferBo(stages: Array<{ stageId: number }>): number {
  const maps = stages.filter((s) => s.stageId > 0).map((s) => s.stageId);
  if (!maps.length) return stages.some((s) => s.stageId === 0) ? 1 : 0;
  return Math.max(...maps);
}

export interface PbParsedStage {
  stageId: number;
  label: string;
  winHome: number;
  winAway: number;
  winHomeId: string;
  winAwayId: string;
  winMarketId: string;
  winLineId?: number;
  winLocked: boolean;
  betName: string;
}

export interface PbParsedMatch {
  matchId: string;
  gameId: string;
  gameCode: string;
  gameName: string;
  leagueName: string;
  bo: number;
  startTime: number;
  isLive: boolean;
  home: { id: string; name: string; englishName: string };
  away: { id: string; name: string; englishName: string };
  stages: PbParsedStage[];
}

export function parseEuroOddsPayload(
  data: Record<string, unknown>,
  options: { allowedSlugs?: string[] } = {},
): { matches: PbParsedMatch[] } {
  const allowedSlugs = options.allowedSlugs
    ? new Set(options.allowedSlugs.map(slugify))
    : null;

  const matches: PbParsedMatch[] = [];
  const leagues = (data.leagues ?? []) as Array<Record<string, unknown>>;

  for (const league of leagues) {
    const gameSlug = slugify(String(league.gameCode ?? ""));
    if (allowedSlugs && !allowedSlugs.has(gameSlug)) continue;

    for (const event of (league.events ?? []) as Array<Record<string, unknown>>) {
      const participants = (event.participants ?? []) as Array<Record<string, unknown>>;
      const home = participants.find((p) => p.type === "HOME");
      const away = participants.find((p) => p.type === "AWAY");
      if (!home || !away) continue;
      if (isKillsSide(home) || isKillsSide(away)) continue;

      const matchId = String(event.id);
      const stages: PbParsedStage[] = [];
      const periods = (event.periods ?? {}) as Record<string, Record<string, unknown>>;

      for (const key of Object.keys(periods)) {
        const map = Number(key);
        if (Number.isNaN(map)) continue;
        const period = periods[key];
        const ml = period?.moneyLine as Record<string, unknown> | undefined;
        if (!ml || ml.unavailable) continue;

        const locked = isLocked(ml);
        const homeOdds = toNumber(ml.homePrice);
        const awayOdds = toNumber(ml.awayPrice);
        const homeItemId = selectionId(matchId, map, "HOME");
        const awayItemId = selectionId(matchId, map, "AWAY");
        const betId = `${matchId}:${map}`;

        stages.push({
          stageId: map,
          label: periodLabel(map),
          winHome: homeOdds,
          winAway: awayOdds,
          winHomeId: homeItemId,
          winAwayId: awayItemId,
          winMarketId: betId,
          winLineId: toNumber(ml.lineId) || undefined,
          winLocked: locked,
          betName: betNameForMap(map),
        });
      }

      stages.sort((a, b) => a.stageId - b.stageId);

      matches.push({
        matchId,
        gameId: gameSlug,
        gameCode: gameSlug,
        gameName: String(league.gameName || league.name || gameSlug),
        leagueName: String(league.name || ""),
        bo: inferBo(stages),
        startTime: toNumber(event.time) || Date.now(),
        isLive: Boolean(event.live || event.isLive),
        home: {
          id: slugify(String(home.englishName || home.name)),
          name: String(home.name || home.englishName || ""),
          englishName: String(home.englishName || ""),
        },
        away: {
          id: slugify(String(away.englishName || away.name)),
          name: String(away.name || away.englishName || ""),
          englishName: String(away.englishName || ""),
        },
        stages,
      });
    }
  }

  matches.sort((a, b) => a.startTime - b.startTime);
  return { matches };
}

export function pbTeamLogo(gameSlug: string, englishName: string): string {
  const team = slugify(englishName);
  return `https://static.storeclutter.com/cdn-cgi/image/width=80,quality=75/images/esports/${gameSlug}/${team}/${team}-logo.png`;
}

export const PB_DEFAULT_ODDS_QUERY =
  "sportId=12&isLive=true&isHlE=false&oddsType=1&version=0" +
  "&language=zh-cn&isHomePage=&leagueCode=&eventType=0&eSportCode=" +
  "&periodNum=0%2C1%2C2%2C3%2C4%2C5%2C6%2C7&participant=&locale=zh_CN";

export function pbOddsUrl(gateway: string): string {
  const base = gateway.replace(/\/+$/, "");
  const ts = Date.now();
  return `${base}/sports-service/sv/euro/odds?${PB_DEFAULT_ODDS_QUERY}&timeStamp=${ts}&_=${ts}&withCredentials=true`;
}
