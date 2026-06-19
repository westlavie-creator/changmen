/**
 * 跨平台赛事合并引擎（@changmen/match-engine）。
 * 依赖：@changmen/shared、@changmen/team-resolver（队伍映射插件，由 matcher 动态注入）。
 */

export * from "./merge/match_merge.js";
export * from "./merge/match_lifecycle.js";
export { MERGE_START_TIME_TOLERANCE_MS, startTimesCompatible } from "./merge/merge_constants.js";
export * from "./teams/team_key.js";
export * from "./teams/match_utils.js";
export { resolveCanonicalTeamName } from "./teams/canonical_ob_name.js";
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
