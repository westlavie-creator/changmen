export {
  type ArbLegs,
  arbLegSide,
  pickArbLegs,
} from "@/domain/arbitrage/pickArbLegs";
export {
  applyArbHedgeStakes,
  arbBaseStake,
  impliedFromLegOdds,
  resolveArbTargetProfit,
} from "@/domain/arbitrage/arbStakeMath";
export {
  arbLegsIncludePolymarket,
  reconcilePolymarketArbStakes,
} from "@/domain/arbitrage/polymarketArbPrecheck";
