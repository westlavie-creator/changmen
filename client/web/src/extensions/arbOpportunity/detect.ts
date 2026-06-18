import { pickArbLegs } from "@/domain/arbitrage";
import { resolveArbProviderKeys, type ArbProviderScope } from "@/domain/betting/providerKeys";
import type { ViewMatch } from "@/models/match";
import type { PlatformAccount } from "@/models/platformAccount";
import type { PlatformId } from "@/types/esport";
import type { UserConfig } from "@/types/userConfig";
import {
  opportunityKey,
  betAnchor,
  type ArbDetectScope,
  type ArbOpportunity,
  type OpportunityKey,
} from "@/extensions/arbOpportunity/types";

export interface DetectOpportunitiesParams {
  matches: ViewMatch[];
  config: UserConfig;
  accounts?: PlatformAccount[];
  /** funded 检测：有余额 ≥ betMoney 的在线账号平台 */
  actionablePlatforms?: Iterable<PlatformId>;
}

function resolveProviderKeys(
  scope: ArbDetectScope,
  bet: ViewMatch["bets"][number],
  actionablePlatforms: Iterable<PlatformId>,
): PlatformId[] {
  const arbScope: ArbProviderScope = scope === "fullMarket" ? "display" : "auto";
  return resolveArbProviderKeys(arbScope, {
    bet,
    accountProviderKeys: actionablePlatforms,
  });
}

/** 遍历赛事列表，对每个 bet 调 pickArbLegs */
export function detectOpportunities(
  params: DetectOpportunitiesParams,
  scope: ArbDetectScope,
): ArbOpportunity[] {
  const { matches, config, accounts = [], actionablePlatforms = [] } = params;
  const out: ArbOpportunity[] = [];

  for (const match of matches) {
    for (const bet of match.bets) {
      const providerKeys = resolveProviderKeys(scope, bet, actionablePlatforms);
      if (scope === "funded" && !providerKeys.length) continue;

      const legs = pickArbLegs(bet, config, providerKeys, accounts, match.game);
      if (!legs) continue;

      out.push({
        scope,
        matchId: match.id,
        betId: bet.id,
        matchTitle: match.title,
        betName: bet.getBetName(),
        homePlatform: legs.homeItem.type,
        awayPlatform: legs.awayItem.type,
        homeOdds: legs.homeOdds,
        awayOdds: legs.awayOdds,
        implied: legs.implied,
      });
    }
  }

  return out;
}

/** 仅对指定聚合盘口锚点（matchId:betId）做 detect；供 kakaxi 增量检测 */
export function detectOpportunitiesForBets(
  params: DetectOpportunitiesParams,
  scope: ArbDetectScope,
  betAnchors: Set<string>,
): ArbOpportunity[] {
  if (!betAnchors.size) return [];

  const { matches, config, accounts = [], actionablePlatforms = [] } = params;
  const out: ArbOpportunity[] = [];

  for (const match of matches) {
    for (const bet of match.bets) {
      if (!betAnchors.has(betAnchor({ matchId: match.id, betId: bet.id }))) continue;

      const providerKeys = resolveProviderKeys(scope, bet, actionablePlatforms);
      if (scope === "funded" && !providerKeys.length) continue;

      const legs = pickArbLegs(bet, config, providerKeys, accounts, match.game);
      if (!legs) continue;

      out.push({
        scope,
        matchId: match.id,
        betId: bet.id,
        matchTitle: match.title,
        betName: bet.getBetName(),
        homePlatform: legs.homeItem.type,
        awayPlatform: legs.awayItem.type,
        homeOdds: legs.homeOdds,
        awayOdds: legs.awayOdds,
        implied: legs.implied,
      });
    }
  }

  return out;
}

/** 同一盘口在 funded 检测中的可执行机会（供通知旁路懒算） */
export function findFundedOpportunityForBet(
  params: DetectOpportunitiesParams,
  matchId: number,
  betId: number,
): ArbOpportunity | undefined {
  return detectOpportunities(params, "funded").find(
    (o) => o.matchId === matchId && o.betId === betId,
  );
}

/** funded 机会涉及的 matchId:betId 集合（kakaxi / marketWatch 等扩展用） */
export function buildFundedBetAnchorSet(params: DetectOpportunitiesParams): Set<string> {
  const anchors = new Set<string>();
  for (const opp of detectOpportunities(params, "funded")) {
    anchors.add(betAnchor(opp));
  }
  return anchors;
}

/** 按 opportunityKey 索引，供 state diff 使用 */
export function indexOpportunities(
  opportunities: ArbOpportunity[],
): Map<OpportunityKey, ArbOpportunity> {
  const map = new Map<OpportunityKey, ArbOpportunity>();
  for (const opp of opportunities) {
    map.set(opportunityKey(opp), opp);
  }
  return map;
}
