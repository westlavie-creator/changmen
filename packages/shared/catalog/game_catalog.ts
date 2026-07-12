import catalog from "./game_catalog.json" with { type: "json" };

export const DEFAULT_GAME_SPORT = "esport";

interface GameEntry {
  code: string;
  sport?: string;
  name: string;
  nameEn: string;
  a8GameId?: number;
  a8Name?: string;
  platforms?: Record<string, string>;
}

/** 平博 league.gameCode 经 slugify 后的别名 → catalog code */
const PB_SLUG_ALIASES: Record<string, string> = {
  "cs": "cs2",
  "cs2": "cs2",
  "counter-strike-2": "cs2",
  "valorant": "valorant",
  "lol": "lol",
  "league-of-legends": "lol",
  "dota2": "dota2",
  "dota-2": "dota2",
  "kog": "kog",
  "king-of-glory": "kog",
  "honor-of-kings": "kog",
};

/** A8 Stake `_Q` SourceGameID aliases. */
const STAKE_A8_ALIASES: Record<string, string> = {
  CS2: "cs2",
  LOL: "lol",
  GOK: "kog",
  Dota2: "dota2",
  Valorant: "valorant",
};

/** Polymarket Gamma events series_slug / tag slug aliases. */
const POLYMARKET_ALIASES: Record<string, string> = {
  "counter-strike": "cs2",
  "counter-strike-2": "cs2",
  "cs2": "cs2",
  "league-of-legends": "lol",
  "lol": "lol",
  "dota-2": "dota2",
  "dota2": "dota2",
  "honor-of-kings": "kog",
  "king-of-glory": "kog",
  "kings-of-glory": "kog",
  "hok": "kog",
  "kog": "kog",
  "valorant": "valorant",
};

/** Limitless metadata.esportTitle → catalog code */
const LIMITLESS_ALIASES: Record<string, string> = {
  "cs2": "cs2",
  "counter-strike-2": "cs2",
  "lol": "lol",
  "league-of-legends": "lol",
  "dota-2": "dota2",
  "dota2": "dota2",
  "valorant": "valorant",
};

/** SXBet SourceGameID / league alias → catalog code */
const SXBET_ALIASES: Record<string, string> = {
  "cs2": "cs2",
  "lol": "lol",
  "dota2": "dota2",
  "dota-2": "dota2",
  "valorant": "valorant",
  "kog": "kog",
};

/** Azuro sportId / slug → catalog code */
const AZURO_ALIASES: Record<string, string> = {
  "1061": "cs2",
  "1002": "lol",
  "1000": "dota2",
  "cs2": "cs2",
  "lol": "lol",
  "dota-2": "dota2",
  "dota2": "dota2",
};

/** TF 王者荣耀：A8 采集用 14；旧 probe 曾记 43 */
const TF_GAME_ALIASES: Record<number, string> = {
  43: "kog",
};

function listGames(): GameEntry[] {
  return (catalog.games as GameEntry[]).slice();
}

function getGameByCode(code: string): GameEntry | null {
  return (catalog.games as GameEntry[]).find(g => g.code === code) || null;
}

/** game_catalog.code → sport；缺省 esport */
function getGameSport(code: string): string | null {
  const game = getGameByCode(code);
  if (!game)
    return null;
  return game.sport ?? DEFAULT_GAME_SPORT;
}

function normalizePlatformKey(platform: string): string {
  const raw = String(platform || "").trim();
  if (!raw)
    return raw;
  const lower = raw.toLowerCase();
  const hit = (catalog.games as GameEntry[])
    .flatMap(g => Object.keys(g.platforms || {}))
    .find(key => key.toLowerCase() === lower);
  return hit || raw;
}

function parseActiveGameCodes(): string[] {
  const raw = process.env.AGGREGATE_GAME_CODES;
  if (!raw || raw === "*") {
    return (catalog.games as GameEntry[]).map(g => g.code);
  }
  const wanted = new Set(
    raw
      .split(/[,;\s]+/)
      .map(s => s.trim().toLowerCase())
      .filter(Boolean),
  );
  return (catalog.games as GameEntry[]).filter(g => wanted.has(g.code)).map(g => g.code);
}

function getActiveGames(): GameEntry[] {
  const codes = new Set(parseActiveGameCodes());
  return (catalog.games as GameEntry[]).filter(g => codes.has(g.code));
}

function getPlatformGameId(platform: string, code: string): string | null {
  platform = normalizePlatformKey(platform);
  const game = getGameByCode(code);
  const id = game?.platforms?.[platform];
  return id != null ? String(id) : null;
}

function getGameCodeForPlatformId(platform: string, gameId: string | number): string | null {
  platform = normalizePlatformKey(platform);
  const id = String(gameId);
  if (platform === "PB") {
    const alias = PB_SLUG_ALIASES[id];
    if (alias)
      return alias;
  }
  if (platform === "Stake") {
    const alias = STAKE_A8_ALIASES[id];
    if (alias)
      return alias;
  }
  if (platform === "Polymarket") {
    const alias = POLYMARKET_ALIASES[id.toLowerCase()];
    if (alias)
      return alias;
  }
  if (platform === "Limitless") {
    const alias = LIMITLESS_ALIASES[id.toLowerCase()];
    if (alias)
      return alias;
  }
  if (platform === "SXBet") {
    const alias = SXBET_ALIASES[id.toLowerCase()];
    if (alias)
      return alias;
  }
  if (platform === "Azuro") {
    const alias = AZURO_ALIASES[id.toLowerCase()];
    if (alias)
      return alias;
  }
  if (platform === "TF") {
    const alias = TF_GAME_ALIASES[id as unknown as number];
    if (alias)
      return alias;
  }
  for (const game of catalog.games as GameEntry[]) {
    if (String(game.platforms?.[platform]) === id) {
      return game.code;
    }
  }
  return null;
}

function isAllowedPlatformGameId(platform: string, gameId: string | number): boolean {
  const code = getGameCodeForPlatformId(platform, gameId);
  if (!code)
    return false;
  return parseActiveGameCodes().includes(code);
}

function getActivePlatformGameIds(platform: string): string[] {
  platform = normalizePlatformKey(platform);
  return getActiveGames()
    .map(g => g.platforms?.[platform])
    .filter(Boolean)
    .map(String);
}

interface PlatformGameDescription {
  gameCode: string;
  gameName: string;
  gameNameEn: string;
  a8GameId: number | null;
  inCatalog: boolean;
}

function describePlatformGame(platform: string, gameId: string | number): PlatformGameDescription {
  const code = getGameCodeForPlatformId(platform, gameId);
  if (code) {
    const game = getGameByCode(code);
    return {
      gameCode: code,
      gameName: game?.a8Name || game?.name || code,
      gameNameEn: game?.nameEn || code,
      a8GameId: game?.a8GameId ?? null,
      inCatalog: true,
    };
  }
  return {
    gameCode: "unknown",
    gameName: `未知(${gameId})`,
    gameNameEn: "Unknown",
    a8GameId: null,
    inCatalog: false,
  };
}

interface ClientGameResult {
  Game: string;
  GameID: number;
}

/** Client_GetMatchs 的 Game / GameID（A8 服务端整理后下发，前端直接展示 Game） */
function resolveClientGame(platform: string, sourceGameId: string | number): ClientGameResult {
  const info = describePlatformGame(platform, sourceGameId);
  return {
    Game: info.gameName,
    GameID: info.a8GameId ?? 0,
  };
}

interface CatalogSummary {
  version: number;
  updatedAt: string;
  activeCodes: string[];
  games: {
    code: string;
    name: string;
    nameEn: string;
    platformIds: Record<string, string> | undefined;
  }[];
}

function getCatalogSummary(): CatalogSummary {
  return {
    version: catalog.version,
    updatedAt: catalog.updatedAt,
    activeCodes: parseActiveGameCodes(),
    games: getActiveGames().map(g => ({
      code: g.code,
      name: g.name,
      nameEn: g.nameEn,
      platformIds: g.platforms,
    })),
  };
}

export {
  catalog,
  describePlatformGame,
  getActiveGames,
  getActivePlatformGameIds,
  getCatalogSummary,
  getGameByCode,
  getGameCodeForPlatformId,
  getGameSport,
  getPlatformGameId,
  isAllowedPlatformGameId,
  listGames,
  parseActiveGameCodes,
  resolveClientGame,
};
