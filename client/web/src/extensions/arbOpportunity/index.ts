/**
 * [changmen 扩展] 套利 detect 工具 + 全盘口观察见 arbMarketWatch。
 * A8 套利调度见 stores/betting/a8；kakaxi 调度见 stores/betting/kakaxi（与 a8 并列）。
 */
export {
  buildFundedBetAnchorSet,
  detectOpportunities,
  type DetectOpportunitiesParams,
  findFundedOpportunityForBet,
  indexOpportunities,
} from "@/extensions/arbOpportunity/detect";

export {
  diffOpportunities,
  type OpportunityTransition,
  snapshotOpportunities,
} from "@/extensions/arbOpportunity/state";

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
} from "@/extensions/arbOpportunity/types";

export {
  ARB_DETECT_ENGINES,
  type ArbDetectEngine,
  isKakaxiArbDetectSelectable,
  KAKAXI_ARB_DETECT_ENABLED,
  resolveArbDetectEngine,
  usesA8ArbDetectEngine,
  usesKakaxiArbDetectEngine,
} from "@/types/arbDetectEngine";
