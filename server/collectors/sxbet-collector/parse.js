/**
 * SXBet 电竞 discovery 解析（**唯一权威**）。
 * VPS collector：markets/active + odds/best → platform_* + MarketIndex。
 * 浏览器不跑本文件；`client/venue-adapter/sxbet/parse.ts` **只**保留报价/下单工具，
 * 禁止再镜像 `buildSxMappedMarket`。
 */

import { truncateOddsTo3 } from "@changmen/shared/odds_format";

const PLATFORM = "SXBet";
export const SX_ODDS_PRECISION = 1e20;
const ODDS_PRECISION = SX_ODDS_PRECISION;

const LEAGUE_GAME_PATTERNS = [
  [/\b(lol|league of legends)\b/i, "lol"],
  [/\b(cs2|cs:?go|counter[- ]?strike)\b/i, "cs2"],
  [/\b(dota\s*2?|dota-2)\b/i, "dota2"],
  [/\bvalorant\b/i, "valorant"],
  [/\b(kog|honor of kings|king of glory)\b/i, "kog"],
];

export function mapSxLeagueToGameCode(leagueLabel) {
  const label = String(leagueLabel ?? "").trim();
  if (!label)
    return null;
  for (const [pattern, code] of LEAGUE_GAME_PATTERNS) {
    if (pattern.test(label))
      return code;
  }
  return null;
}

export function sxRawOddsToImplied(raw) {
  const value = Number(raw);
  if (!Number.isFinite(value) || value <= 0)
    return 0;
  return value / ODDS_PRECISION;
}

export function sxImpliedToDecimal(implied) {
  if (!Number.isFinite(implied) || implied <= 0 || implied >= 1)
    return 0;
  return truncateOddsTo3(1 / implied);
}

/**
 * REST `/orders/odds/best`：outcomeX.percentageOdds 是 **maker** 视角。
 * 吃 outcomeOne 的 taker 面对 maker-on-two → takerImplied = 1 - makerTwo。
 */
export function bestSxDecimalOddsFromBestRow(row, forOutcomeOne) {
  if (!row)
    return 0;
  const makerOpposite = forOutcomeOne ? row.outcomeTwo : row.outcomeOne;
  const makerImplied = sxRawOddsToImplied(makerOpposite?.percentageOdds ?? undefined);
  if (!makerImplied || makerImplied >= 1)
    return 0;
  return sxImpliedToDecimal(1 - makerImplied);
}

export function normalizeSxTeamName(name) {
  const normalized = String(name || "")
    .normalize("NFKC")
    .trim()
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9\u4E00-\u9FFF]+/gi, "-")
    .replace(/^-+|-+$/g, "");
  return normalized || "unknown";
}

export function sxSourceTeamId(gameId, name) {
  return `${gameId}:${normalizeSxTeamName(name)}`;
}

export function sxOutcomeOddsId(marketHash, outcome) {
  return `${marketHash}:${outcome}`;
}

export function isSxEsportsMoneylineMarket(market) {
  if (String(market.status ?? "").toUpperCase() !== "ACTIVE")
    return false;
  if (Number(market.sportId) !== 9)
    return false;
  if (Number(market.type) !== 52)
    return false;
  if (!market.marketHash || !market.sportXeventId)
    return false;
  if (!market.teamOneName || !market.teamTwoName)
    return false;
  return Boolean(mapSxLeagueToGameCode(market.leagueLabel));
}

/**
 * @param {object} market
 * @param {object} [bestRow]
 * @returns {{ match: object, bet: object, marketHash: string, homeOddsId: string, awayOddsId: string } | null}
 */
export function buildSxMappedMarket(market, bestRow) {
  if (!isSxEsportsMoneylineMarket(market))
    return null;

  const gameId = mapSxLeagueToGameCode(market.leagueLabel);
  const marketHash = String(market.marketHash);
  const sourceMatchId = String(market.sportXeventId);
  if (!gameId || !marketHash || !sourceMatchId)
    return null;

  const homeName = String(market.teamOneName);
  const awayName = String(market.teamTwoName);
  const homeId = sxSourceTeamId(gameId, homeName);
  const awayId = sxSourceTeamId(gameId, awayName);
  const homeOddsId = sxOutcomeOddsId(marketHash, 1);
  const awayOddsId = sxOutcomeOddsId(marketHash, 2);
  const startTime = Number(market.gameTime) > 0 ? Number(market.gameTime) * 1000 : Date.now();

  const homeOdds = bestSxDecimalOddsFromBestRow(bestRow, true);
  const awayOdds = bestSxDecimalOddsFromBestRow(bestRow, false);
  const locked = !homeOdds || !awayOdds;

  return {
    marketHash,
    homeOddsId,
    awayOddsId,
    match: {
      Type: PLATFORM,
      SourceMatchID: sourceMatchId,
      SourceGameID: gameId,
      StartTime: startTime,
      HomeID: homeId,
      Home: homeName,
      AwayID: awayId,
      Away: awayName,
      Teams: [
        { Type: PLATFORM, TeamID: homeId, Name: homeName, GameID: gameId, Logo: "" },
        { Type: PLATFORM, TeamID: awayId, Name: awayName, GameID: gameId, Logo: "" },
      ],
      IsLive: market.liveEnabled ? 2 : 1,
    },
    bet: {
      Type: PLATFORM,
      SourceMatchID: sourceMatchId,
      SourceBetID: marketHash,
      Map: 0,
      BetName: "[全场] 获胜者",
      SourceHomeID: homeOddsId,
      HomeName: homeName,
      HomeOdds: homeOdds,
      SourceAwayID: awayOddsId,
      AwayName: awayName,
      AwayOdds: awayOdds,
      Status: locked ? "Locked" : "Normal",
    },
  };
}
