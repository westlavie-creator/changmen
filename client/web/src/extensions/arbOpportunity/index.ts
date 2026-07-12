/**
 * [changmen 扩展] 套利 detect 工具 + 全盘口观察见 arbMarketWatch。
 * 自动套利调度见 stores/betting/a8（与 A8 bundle 一致）。
 */
export {
  detectOpportunities,
  type DetectOpportunitiesParams,
  findFundedOpportunityForBet,
  indexOpportunities,
} from "@changmen/arb-core/opportunity/detect";

export {
  diffOpportunities,
  type OpportunityTransition,
  snapshotOpportunities,
} from "@changmen/arb-core/opportunity/state";

export {
  applyArbRuntimeState,
  type ArbRuntimeFlags,
  installArbRuntimeSync,
  resolveArbRuntimeFlags,
  stopArbRuntime,
  syncArbRuntime,
  teardownArbRuntimeSync,
} from "@/extensions/arbOpportunity/syncArbRuntime";

export {
  type ArbDetectScope,
  type ArbOpportunity,
  betAnchor,
  opportunityKey,
  type OpportunityKey,
} from "@changmen/arb-core/opportunity/types";
