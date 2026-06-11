"use strict";

/**
 * 跨平台赛事合并引擎（gamebet_matcher/engine）。
 * 依赖：changmen/shared、team-resolver（队伍映射插件）。
 */

const merge = require("./merge/match_merge");
const teams = require("./teams/team_key");
const priority = require("./teams/provider_priority");
const matchUtils = require("./teams/match_utils");
const ids = require("./ids/client_match_ids");

module.exports = {
  ...merge,
  ...teams,
  ...matchUtils,
  PROVIDER_PRIORITY: priority.PROVIDER_PRIORITY,
  teamsFromPlatformRows: priority.teamsFromPlatformRows,
  providerPriority: priority.providerPriority,
  resolveCanonicalSideNames: priority.resolveCanonicalSideNames,
  resolveClientMatchIds: ids.resolveClientMatchIds,
  ensureClientMatchId: ids.ensureClientMatchId,
  manualMergeKey: ids.manualMergeKey,
};
