/**
 * 从 platform_bets 取原生盘口 Source（不经 match-engine bet_builder / accumulate）。
 */
import { formatOdds, truncateOddsTo3 } from "@changmen/shared/odds_format";
import {
  iaLegacyWinBetName,
  matchesSavedBet,
  obLegacyWinBetName,
  obSavedBetIsMatchWinner,
  rayLegacyWinBetName,
} from "@changmen/shared/catalog/market_catalog";

export function betBucketKey(platform, sourceMatchId) {
  return `${platform}:${sourceMatchId}`;
}

function winPriority(bet, provider, gameCode) {
  const name = String(bet?.BetName ?? bet?.Name ?? "");
  if (name.includes("+"))
    return 0;
  if (provider === "OB" && gameCode && obSavedBetIsMatchWinner(bet, gameCode))
    return 200;
  if (provider === "OB" && obLegacyWinBetName(name))
    return 150;
  if (provider === "RAY" && rayLegacyWinBetName(name))
    return 100;
  if (provider === "IA" && iaLegacyWinBetName(name))
    return 100;
  if (provider === "Polymarket" || provider === "PredictFun")
    return 120;
  return 10;
}

function isWinBet(bet, provider, gameCode) {
  const name = String(bet?.BetName ?? bet?.Name ?? "");
  if (name.includes("+"))
    return false;
  if (provider === "OB") {
    if (gameCode && obSavedBetIsMatchWinner(bet, gameCode))
      return true;
    return obLegacyWinBetName(name);
  }
  if (provider === "RAY")
    return matchesSavedBet("RAY", bet, { gameCode }) || rayLegacyWinBetName(name);
  if (provider === "IA")
    return matchesSavedBet("IA", bet, { gameCode }) || iaLegacyWinBetName(name);
  if (provider === "Polymarket" || provider === "PredictFun" || provider === "PB" || provider === "TF")
    return true;
  return Boolean(bet?.SourceHomeID || bet?.SourceAwayID);
}

export function cloneRawSource(src) {
  if (!src)
    return null;
  return {
    Type: src.Type,
    BetID: String(src.BetID ?? ""),
    HomeID: String(src.HomeID ?? ""),
    AwayID: String(src.AwayID ?? ""),
    HomeOdds: src.HomeOdds,
    AwayOdds: src.AwayOdds,
    Status: src.Status || "Normal",
  };
}

export function sourceFromBet(provider, b) {
  const homeRaw = Number(b.HomeOdds) || 0;
  const awayRaw = Number(b.AwayOdds) || 0;
  const useTrunc = provider === "Polymarket" || provider === "PredictFun";
  return {
    Type: provider,
    BetID: String(b.SourceBetID),
    HomeID: String(b.SourceHomeID || ""),
    AwayID: String(b.SourceAwayID || ""),
    HomeOdds: useTrunc ? truncateOddsTo3(homeRaw) : formatOdds(homeRaw),
    AwayOdds: useTrunc ? truncateOddsTo3(awayRaw) : formatOdds(awayRaw),
    Status: b.Status || "Normal",
  };
}

/**
 * @returns {Map<number, object>} mapNum → raw Source
 */
export function nativeSourcesByMap(platform, sourceMatchId, bets, gameCode) {
  const block = bets?.[betBucketKey(platform, sourceMatchId)]
    || bets?.[`${platform}:${String(sourceMatchId)}`];
  const list = Array.isArray(block) ? block : (block?.bets || []);
  const byMap = new Map();
  for (const bet of list) {
    if (!isWinBet(bet, platform, gameCode))
      continue;
    const mapNum = Number(bet.Map) || 0;
    const prev = byMap.get(mapNum);
    if (!prev || winPriority(bet, platform, gameCode) > winPriority(prev, platform, gameCode))
      byMap.set(mapNum, bet);
  }
  const out = new Map();
  for (const [mapNum, bet] of byMap)
    out.set(mapNum, sourceFromBet(platform, bet));
  return out;
}

export function rawSourceForMap(platform, sourceMatchId, mapNum, bets, gameCode) {
  const byMap = nativeSourcesByMap(platform, sourceMatchId, bets, gameCode);
  return cloneRawSource(byMap.get(Number(mapNum) || 0) || null);
}
