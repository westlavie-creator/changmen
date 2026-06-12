/**
 * 通用赔率过滤 + 构建（OB / RAY / IM 等各平台）。
 */

import { stableId, betKey, isPlaceholderTeamName } from "../teams/match_utils.js";
import {
  obSavedBetIsMatchWinner,
  obLegacyWinBetName,
  matchesSavedBet,
  rayLegacyWinBetName,
  iaLegacyWinBetName,
} from "../../../shared/catalog/market_catalog.mjs";
import { pickStr, imBetNameIsCollectible, normalizeImBet } from "../../../shared/im_parse.mjs";
import { filterImStoredWinBets, dedupeImBetsByMap } from "./im_enrich.js";

const OB_WIN_BET_RE =
  /(\[全场\].+获胜)|(\[地图\d+\].+获胜)|(.+全局.+获胜)|(.+单局.+获胜)/;
function winBetPriority(bet, provider, gameCode) {
  const name = String(bet?.BetName ?? bet?.Name ?? "");
  if (name.includes("+")) return 0;
  if (provider === "OB" && gameCode && obSavedBetIsMatchWinner(bet, gameCode)) return 200;
  if (provider === "OB" && obLegacyWinBetName(name)) {
    let p = 150;
    if (name.includes("单局")) p += 10;
    if (name.includes("全局")) p += 5;
    return p;
  }
  if (provider === "RAY" && rayLegacyWinBetName(name)) return 100;
  if (provider === "IA" && iaLegacyWinBetName(name)) return 100;
  if (provider === "OB" && OB_WIN_BET_RE.test(name)) return 100;
  if (bet?.OddTypeID || bet?.odd_type_id) return 90;
  return 0;
}

function dedupeWinBetsByMap(bets, provider, gameCode) {
  const byMap = new Map();
  for (const bet of bets) {
    const map = bet.Map ?? 0;
    const prev = byMap.get(map);
    if (!prev || winBetPriority(bet, provider, gameCode) > winBetPriority(prev, provider, gameCode)) {
      byMap.set(map, bet);
    }
  }
  return [...byMap.values()].sort((a, b) => (a.Map ?? 0) - (b.Map ?? 0));
}

function filterStoredWinBets(bets, provider, gameCode) {
  return (bets || []).filter((bet) => {
    if (provider === "OB") {
      const name = String(bet?.BetName ?? "");
      if (name.includes("+")) return false;
      if (gameCode && obSavedBetIsMatchWinner(bet, gameCode)) return true;
      if (gameCode && obLegacyWinBetName(name)) return true;
      if (!gameCode) return OB_WIN_BET_RE.test(name);
      return false;
    }
    if (provider === "RAY") return matchesSavedBet("RAY", bet, { gameCode });
    if (provider === "IA") return matchesSavedBet("IA", bet, { gameCode });
    if (provider === "IM") {
      const name = pickStr(bet, "BetName", "Name", "name", "betName");
      if (name && !imBetNameIsCollectible(name)) return false;
      return matchesSavedBet("IM", bet, { gameCode });
    }
    return true;
  });
}

function buildBetRow(provider, sourceMatchId, clientMatchId, bet, sourceFromBet, matchTeams) {
  const row = provider === "IM" ? normalizeImBet(bet) : bet;
  const map = row.Map ?? 0;
  const rowSeed = `${provider}:${sourceMatchId}:${map}`;
  const betRowId = stableId(`bet:${rowSeed}`);
  const homeId = stableId(`home:${rowSeed}`);
  const awayId = stableId(`away:${rowSeed}`);
  const matchHome = matchTeams?.home || "";
  const matchAway = matchTeams?.away || "";
  const pickTeamName = (betName, fromMatch) => {
    if (fromMatch && !isPlaceholderTeamName(fromMatch)) return fromMatch;
    if (betName && !isPlaceholderTeamName(betName)) return betName;
    return fromMatch || betName || "";
  };
  return {
    ID: betRowId,
    MatchID: clientMatchId,
    Map: map,
    Name: row.BetName || "",
    HomeID: homeId,
    HomeName: provider === "IM" ? pickTeamName(row.HomeName, matchHome) : row.HomeName || "",
    AwayID: awayId,
    AwayName: provider === "IM" ? pickTeamName(row.AwayName, matchAway) : row.AwayName || "",
    Status: row.Status || "Normal",
    Sources: { [provider]: sourceFromBet(provider, row) },
  };
}

function buildBetsForMatch(provider, sourceMatchId, clientMatchId, bets, sourceFromBet, gameCode, matchTeams) {
  const stored = bets[betKey(provider, sourceMatchId)];
  if (!stored?.bets?.length) return [];
  const winBets = provider === "IM"
    ? dedupeImBetsByMap(filterImStoredWinBets(stored.bets))
    : dedupeWinBetsByMap(filterStoredWinBets(stored.bets, provider, gameCode), provider, gameCode);
  return winBets.map((b) => buildBetRow(provider, sourceMatchId, clientMatchId, b, sourceFromBet, matchTeams));
}

export { buildBetsForMatch };
