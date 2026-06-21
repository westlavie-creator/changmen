/**
 * 跨平台赛事合并引擎（@changmen/match-engine）。
 * 依赖：@changmen/shared、@changmen/team-resolver（队伍映射插件，由 matcher 动态注入）。
 */

export {
  assignMatchIds,
  ensureClientMatchId,
  findLinkedClientIdFromMatchs,
  findReuseIdByMatchsSuperset,
  findReuseIdByPlatformOverlap,
  manualMergeKey,
  matchsIsSubset,
  matchsSignature,
  resolveClientMatchIds,
} from "./ids/client_match_ids.js";
export * from "./merge/match_lifecycle.js";
export * from "./merge/match_merge.js";
export { MERGE_START_TIME_TOLERANCE_MS, startTimesCompatible, startTimesCompatibleStrict } from "./merge/merge_constants.js";
export { resolveCanonicalTeamName } from "./teams/canonical_ob_name.js";
export * from "./teams/match_utils.js";
export {
  pickCanonicalPlatformRow,
  providerPriority,
  resolveCanonicalSideNames,
  sortByProviderPriority,
  teamsFromPlatformRows,
  titleFromPlatformRow,
} from "./teams/provider_priority.js";
export * from "./teams/team_key.js";
