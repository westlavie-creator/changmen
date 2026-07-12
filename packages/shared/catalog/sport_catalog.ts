import catalog from "./sport_catalog.json" with { type: "json" };
import { getGameByCode } from "./game_catalog.ts";

export const DEFAULT_SPORT = "esport";

export interface SportEntry {
  code: string;
  name: string;
  nameEn?: string;
  status: "active" | "planned" | "deprecated";
  defaultGameCodes?: string[];
  matcherProfile?: string;
  linePath?: string;
  apiSportFilter?: string;
  pm2Apps?: string[];
  collect?: {
    mode?: string;
    daemons?: string[];
    platforms?: string[];
  };
  markets?: string[];
}

function listSports(): SportEntry[] {
  return (catalog.sports as SportEntry[]).slice();
}

function getSport(code: string): SportEntry | null {
  const key = String(code || "").trim().toLowerCase();
  if (!key)
    return null;
  return (catalog.sports as SportEntry[]).find(s => s.code === key) || null;
}

function listActiveSports(): SportEntry[] {
  return listSports().filter(s => s.status === "active");
}

/** game_catalog.code → sport_catalog.code；缺省 esport */
function getSportForGameCode(gameCode: string): string | null {
  const game = getGameByCode(gameCode);
  if (!game)
    return null;
  return game.sport ?? DEFAULT_SPORT;
}

function isKnownSport(code: string): boolean {
  return getSport(code) != null;
}

export {
  catalog as sportCatalog,
  getSport,
  getSportForGameCode,
  isKnownSport,
  listActiveSports,
  listSports,
};
