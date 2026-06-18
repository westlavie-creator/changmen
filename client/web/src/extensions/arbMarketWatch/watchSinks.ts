import { findFundedOpportunityForBet, type DetectOpportunitiesParams } from "@/extensions/arbOpportunity/detect";
import type { OpportunityTransition } from "@/extensions/arbOpportunity/state";
import {
  betAnchor,
  opportunityKey,
  type ArbOpportunity,
  type OpportunityKey,
} from "@/extensions/arbOpportunity/types";
import { shouldSendArbOpportunity } from "@/extensions/notify/arbOpportunityConfig";
import { useMessageStore } from "@/stores/messageStore";

/** 全盘口盯盘事件（按 matchId:betId 关联 fullMarket + 懒算 funded） */
export type ArbMarketWatchGroup =
  | {
      kind: "appeared";
      anchor: string;
      matchTitle: string;
      betName: string;
      fullMarket?: ArbOpportunity;
      funded?: ArbOpportunity;
    }
  | {
      kind: "gone";
      anchor: string;
      matchTitle: string;
      betName: string;
      fullMarket?: ArbOpportunity;
      funded?: ArbOpportunity;
    };

function betStillActive(
  anchor: string,
  snapshot: Map<OpportunityKey, ArbOpportunity>,
): boolean {
  return [...snapshot.values()].some((o) => betAnchor(o) === anchor);
}

export function sameOpportunityLegs(a: ArbOpportunity, b: ArbOpportunity): boolean {
  return opportunityKey(a) === opportunityKey(b);
}

function toAppearedGroup(
  opp: ArbOpportunity,
  funded?: ArbOpportunity,
): ArbMarketWatchGroup {
  return {
    kind: "appeared",
    anchor: betAnchor(opp),
    matchTitle: opp.matchTitle,
    betName: opp.betName,
    fullMarket: opp,
    funded,
  };
}

function toGoneGroup(opp: ArbOpportunity, funded?: ArbOpportunity): ArbMarketWatchGroup {
  return {
    kind: "gone",
    anchor: betAnchor(opp),
    matchTitle: opp.matchTitle,
    betName: opp.betName,
    fullMarket: opp,
    funded,
  };
}

/** fullMarket transitions → 盯盘事件（appeared 时懒算 funded） */
export function buildMarketWatchGroups(
  transitions: OpportunityTransition[],
  snapshot: Map<OpportunityKey, ArbOpportunity>,
  detectParams: DetectOpportunitiesParams,
): ArbMarketWatchGroup[] {
  const groups: ArbMarketWatchGroup[] = [];

  for (const transition of transitions) {
    if (transition.kind === "appeared") {
      const opp = transition.opportunity;
      const funded = findFundedOpportunityForBet(detectParams, opp.matchId, opp.betId);
      groups.push(toAppearedGroup(opp, funded));
      continue;
    }

    const opp = transition.previous;
    const anchor = betAnchor(opp);
    if (betStillActive(anchor, snapshot)) continue;
    const funded = findFundedOpportunityForBet(detectParams, opp.matchId, opp.betId);
    groups.push(toGoneGroup(opp, funded));
  }

  return groups;
}

export function deliverMarketWatchSink(
  transitions: OpportunityTransition[],
  snapshot: Map<OpportunityKey, ArbOpportunity>,
  detectParams: DetectOpportunitiesParams,
): void {
  if (!shouldSendArbOpportunity()) return;
  const messageStore = useMessageStore();
  for (const group of buildMarketWatchGroups(transitions, snapshot, detectParams)) {
    messageStore.marketWatchMessage(group);
  }
}
