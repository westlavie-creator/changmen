import type { ArbOpportunity, OpportunityKey } from "@/extensions/arbOpportunity/types";
import { indexOpportunities } from "@/extensions/arbOpportunity/detect";
import { KAKAXI_IMPROVED_EPSILON } from "@/stores/betting/kakaxi/config";

export type KakaxiOpportunityTransition
  = | { kind: "appeared"; opportunity: ArbOpportunity }
    | { kind: "improved"; opportunity: ArbOpportunity; previousImplied: number }
    | { kind: "gone"; key: OpportunityKey; previous: ArbOpportunity };

/** kakaxi 专用 diff：appeared / improved / gone（marketWatch 仍用通用 appeared/gone） */
export function diffKakaxiOpportunities(
  previous: Map<OpportunityKey, ArbOpportunity>,
  current: ArbOpportunity[],
  improvedEpsilon = KAKAXI_IMPROVED_EPSILON,
): KakaxiOpportunityTransition[] {
  const next = indexOpportunities(current);
  const transitions: KakaxiOpportunityTransition[] = [];

  for (const [key, opportunity] of next) {
    const prev = previous.get(key);
    if (!prev) {
      transitions.push({ kind: "appeared", opportunity });
      continue;
    }
    if (opportunity.implied - prev.implied >= improvedEpsilon) {
      transitions.push({
        kind: "improved",
        opportunity,
        previousImplied: prev.implied,
      });
    }
  }

  for (const [key, prev] of previous) {
    if (!next.has(key)) {
      transitions.push({ kind: "gone", key, previous: prev });
    }
  }

  return transitions;
}

export function snapshotKakaxiOpportunities(
  opportunities: ArbOpportunity[],
): Map<OpportunityKey, ArbOpportunity> {
  return indexOpportunities(opportunities);
}
