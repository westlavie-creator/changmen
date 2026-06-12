/**
 * 跨平台赛事合并引擎（gamebet_matcher/engine）。
 * 依赖：changmen/shared、team-resolver（队伍映射插件）。
 */

export * from "./merge/match_merge.js";
export * from "./teams/team_key.js";
export * from "./teams/match_utils.js";
export {
  providerPriority,
  sortByProviderPriority,
  pickCanonicalPlatformRow,
  titleFromPlatformRow,
  teamsFromPlatformRows,
  resolveCanonicalSideNames,
} from "./teams/provider_priority.js";
export {
  matchsSignature,
  matchsIsSubset,
  findReuseIdByMatchsSuperset,
  findLinkedClientIdFromMatchs,
  findReuseIdByPlatformOverlap,
  manualMergeKey,
  assignMatchIds,
  resolveClientMatchIds,
  ensureClientMatchId,
} from "./ids/client_match_ids.js";
