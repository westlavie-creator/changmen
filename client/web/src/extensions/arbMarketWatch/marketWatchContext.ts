import type { DetectOpportunitiesParams } from "@/extensions/arbOpportunity/detect";
import type { ArbOpportunity } from "@/extensions/arbOpportunity/types";
import type { ViewBet, ViewMatch } from "@/models/match";
import type { PlatformId } from "@/types/esport";

export interface ArbMarketWatchPlatformOdds {
  platform: PlatformId;
  homeOdds: number;
  awayOdds: number;
  hasAccount: boolean;
}

/** Telegram 盯盘附加上下文（由 detectParams 解析 match/bet） */
export interface ArbMarketWatchContext {
  game: string;
  homeName: string;
  awayName: string;
  startAt: number;
  bo: number;
  liveRound: number;
  betRound: number;
  isLiveBet: boolean;
  linkedPlatforms: PlatformId[];
  platformOdds: ArbMarketWatchPlatformOdds[];
  minProfit: number;
  maxProfit: number;
  minOdds: number;
  /** 参数配置「开启投注」；关投注时盯盘仅提醒，不会自动下单 */
  bettingEnabled: boolean;
}

function findMatchBet(
  params: DetectOpportunitiesParams,
  matchId: number,
  betId: number,
): { match?: ViewMatch; bet?: ViewBet } {
  const match = params.matches.find((m) => m.id === matchId);
  const bet = match?.bets.find((b) => b.id === betId);
  return { match, bet };
}

export function buildMarketWatchContext(
  params: DetectOpportunitiesParams,
  matchId: number,
  betId: number,
): ArbMarketWatchContext | undefined {
  const { match, bet } = findMatchBet(params, matchId, betId);
  if (!match || !bet) return undefined;

  const actionable = new Set<PlatformId>(
    params.actionablePlatforms ? [...params.actionablePlatforms] : [],
  );

  const platformOdds: ArbMarketWatchPlatformOdds[] = bet.items
    .map((item) => ({
      platform: item.type,
      homeOdds: item.getOdds("Home"),
      awayOdds: item.getOdds("Away"),
      hasAccount: actionable.has(item.type),
    }))
    .filter((row) => row.homeOdds > 0 || row.awayOdds > 0)
    .sort((a, b) => a.platform.localeCompare(b.platform));

  return {
    game: match.game,
    homeName: bet.homeName || match.title.split(/\s+vs\s+/i)[0]?.trim() || "",
    awayName: bet.awayName || match.title.split(/\s+vs\s+/i)[1]?.trim() || "",
    startAt: match.startAt,
    bo: match.bo,
    liveRound: match.liveRound,
    betRound: bet.round,
    isLiveBet: Boolean(bet.isLive),
    linkedPlatforms: Object.keys(match.providers) as PlatformId[],
    platformOdds,
    minProfit: params.config.profit,
    maxProfit: params.config.maxProfit,
    minOdds: params.config.minOdds,
    bettingEnabled: params.config.betting,
  };
}

/** 理论最优腿在当前账号下不可执行时的说明 */
export function explainNotExecutable(
  fullMarket: ArbOpportunity,
  ctx: ArbMarketWatchContext,
): string {
  if (!ctx.bettingEnabled) {
    return "未开启投注";
  }

  const byPlatform = new Map(ctx.platformOdds.map((row) => [row.platform, row]));
  const missing: string[] = [];

  for (const leg of [
    { platform: fullMarket.homePlatform, side: "主" as const },
    { platform: fullMarket.awayPlatform, side: "客" as const },
  ]) {
    const row = byPlatform.get(leg.platform);
    if (!row) {
      missing.push(`${leg.platform}(${leg.side}，盘口无该平台)`);
      continue;
    }
    if (!row.hasAccount) {
      missing.push(`${leg.platform}(${leg.side}，无可用账号)`);
    }
  }

  if (missing.length) return missing.join("；");
  return "有余额账号无法凑齐理论最优组合（限红/利润门槛/同平台限制）";
}
