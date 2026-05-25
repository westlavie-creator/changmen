/** 对齐 backend/platforms/stake/stake_core.js / A8 YZe */

export const STAKE_SPORT_SLUGS: Record<string, string> = {
  "dota-2": "dota2",
  "counter-strike": "cs2",
  "league-of-legends": "lol",
  "kings-of-glory": "kog",
  valorant: "valorant",
};

export const STAKE_GRAPHQL = `query SportIndex($sport: String!, $groups: [String!]!, $type: SportSearchEnum = popular) {
  slugSport(sport: $sport, type: $type) {
    firstTournament {
      fixtureList {
        id
        slug
        status
        data {
          startTime
          competitors { extId iconPath }
          teams { qualifier name }
        }
        groups {
          name
          templates {
            markets {
              id
              name
              status
              outcomes { id active odds }
            }
          }
        }
      }
    }
  }
}`;

export function parseMapFromMarketName(name: string): number | undefined {
  if (name === "比赛获胜者 - Two 路线") return 0;
  const m = /地图(\d)获胜者 - Two 路线/.exec(String(name || ""));
  return m ? Number(m[1]) : undefined;
}

export interface StakeParsedStage {
  stageId: number;
  label: string;
  winMarketId: string;
  winHomeId: string;
  winAwayId: string;
  winHome: number | null;
  winAway: number | null;
  winLocked: boolean;
  betName: string;
}

export interface StakeParsedMatch {
  matchId: string;
  gameId: string;
  gameCode: string;
  startTime: number;
  home: { id: string; name: string };
  away: { id: string; name: string };
  stages: StakeParsedStage[];
}

export function normalizeGraphqlSport(sportSlug: string, payload: Record<string, unknown>): StakeParsedMatch[] {
  const gameCode = STAKE_SPORT_SLUGS[sportSlug] || sportSlug;
  const matches: StakeParsedMatch[] = [];
  const data = payload.data as Record<string, unknown> | undefined;
  const slugSport = data?.slugSport as Record<string, unknown> | undefined;
  const firstTournament = slugSport?.firstTournament as Record<string, unknown> | undefined;
  const list = (firstTournament?.fixtureList ?? []) as Array<Record<string, unknown>>;
  const horizon = Date.now() + 3600_000;

  for (const fixture of list) {
    if (!["live", "active"].includes(String(fixture.status))) continue;
    const fixtureData = fixture.data as Record<string, unknown>;
    const startTime = new Date(String(fixtureData.startTime)).getTime();
    if (startTime > horizon) continue;
    const teams = (fixtureData.teams ?? []) as Array<{ qualifier?: string; name?: string }>;
    const homeTeam = teams.find((t) => t.qualifier === "home");
    const awayTeam = teams.find((t) => t.qualifier === "away");
    if (!homeTeam?.name || !awayTeam?.name) continue;
    const comps = (fixtureData.competitors ?? []) as Array<{ extId?: string }>;
    if (comps.length !== 2) continue;
    const homeId = comps[0]?.extId?.split(":").pop();
    const awayId = comps[1]?.extId?.split(":").pop();
    if (!homeId || !awayId) continue;

    const stages: StakeParsedStage[] = [];
    for (const group of (fixture.groups ?? []) as Array<{ name?: string; templates?: unknown[] }>) {
      if (group.name !== "maps" && group.name !== "winner") continue;
      for (const template of (group.templates ?? []) as Array<{ markets?: unknown[] }>) {
        for (const market of (template.markets ?? []) as Array<Record<string, unknown>>) {
          const outcomes = (market.outcomes ?? []) as Array<{ id?: string; active?: boolean; odds?: number }>;
          if (outcomes.length !== 2) continue;
          const stageId = parseMapFromMarketName(String(market.name ?? ""));
          if (stageId === undefined) continue;
          const locked = market.status !== "active";
          const homeOutcome = outcomes[0]!;
          const awayOutcome = outcomes[1]!;
          stages.push({
            stageId,
            label: stageId === 0 ? "全场" : `地图${stageId}`,
            winMarketId: String(market.id),
            winHomeId: String(homeOutcome.id),
            winAwayId: String(awayOutcome.id),
            winHome: !locked && homeOutcome.active ? Number(homeOutcome.odds) : null,
            winAway: !locked && awayOutcome.active ? Number(awayOutcome.odds) : null,
            winLocked: locked,
            betName: String(market.name ?? ""),
          });
        }
      }
    }

    matches.push({
      matchId: String(fixture.id),
      gameId: sportSlug,
      gameCode,
      startTime,
      home: { id: homeId, name: homeTeam.name },
      away: { id: awayId, name: awayTeam.name },
      stages,
    });
  }

  return matches;
}
