/**
 * [changmen 扩展] 套利 detect 工具 + 全盘口观察见 arbMarketWatch。
 * A8 套利调度见 stores/betting/a8；kakaxi 调度见 stores/betting/kakaxi（与 a8 并列）。
 */
export {
  detectOpportunities,
  findFundedOpportunityForBet,
  buildFundedBetAnchorSet,
  indexOpportunities,
  type DetectOpportunitiesParams,
} from "@/extensions/arbOpportunity/detect";

export {
  diffOpportunities,
  snapshotOpportunities,
  type OpportunityTransition,
} from "@/extensions/arbOpportunity/state";

export {
  resolveArbDetectEngine,
  usesA8ArbDetectEngine,
  usesKakaxiArbDetectEngine,
  isKakaxiArbDetectSelectable,
  KAKAXI_ARB_DETECT_ENABLED,
  ARB_DETECT_ENGINES,
  type ArbDetectEngine,
} from "@/extensions/arbOpportunity/arbDetectEngine";

export {
  installArbRuntimeSync,
  syncArbRuntime,
  stopArbRuntime,
  teardownArbRuntimeSync,
  resolveArbRuntimeFlags,
  applyArbRuntimeState,
  type ArbRuntimeFlags,
} from "@/extensions/arbOpportunity/syncArbRuntime";

export {
  opportunityKey,
  betAnchor,
  type ArbDetectScope,
  type ArbOpportunity,
  type OpportunityKey,
} from "@/extensions/arbOpportunity/types";
