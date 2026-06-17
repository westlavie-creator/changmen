/**
 * 数据层唯一入口 — 所有数据库读写均从此文件 import。
 * 内部走 RDS（pg）；业务代码勿直连 impl / team_store / matcher_store。
 */

import { loadChangmenEnv } from "./load_env.js";

loadChangmenEnv();

import { describeDbScript, getDbMode } from "./db_mode.js";

const mode = getDbMode();

const impl = await import("./impl_rds.js");
const team = await import("./team_store.js");

console.log(`[db] ${mode.script} — ${describeDbScript(mode.script)} (${mode.impl})`);

export {
  DB_SCRIPT_MODES,
  resolveDbScript,
  describeDbScript,
  usesRdsImpl,
  getDbMode,
} from "./db_mode.js";

export { loadChangmenEnv } from "./load_env.js";

/** 当前生效模式（进程启动时解析） */
export function getActiveDbScript() {
  return mode.script;
}

export const {
  hasAdminAccess,
  isAuthConfigured,
  getServiceClient,
  setPlatformMatchId,
  fetchProfiles,
  fetchProfileById,
  writeProfile,
  insertProfile,
  updateUserName,
  updateUserIsAdmin,
  writeAccounts,
  writeClientMatches,
  writeClientMatchesAsync,
  fetchClientMatches,
  fetchClientMatchesMeta,
  initLastWrittenIds,
  clearClientMatchesOnStartup,
  fetchPlatformMatches,
  fetchPlatformBets,
  fetchLiveTimers,
  writePlatformMatches,
  writePlatformBets,
  replacePlatformBetsForMatch,
  writeLiveTimers,
  writeLiveTimersAsync,
  purgePlatformLiveTimers,
  fetchOrdersByDate,
  fetchOrdersByPlayer,
  fetchProfilesAdmin,
  fetchOrdersAdminStats,
  fetchOrdersAdminPage,
  deleteOrdersByIds,
  fetchOrdersAdminAll,
  fetchOrdersForMonthAggregate,
  fetchOrdersForProfitAggregate,
  fetchMoneyLogsByPlayer,
  fetchMoneyLogById,
  fetchAllMoneyLogs,
  upsertMoneyLog,
  deleteMoneyLogById,
  deleteMoneyLogsByPlayer,
  fetchTagPlatforms,
  upsertTagPlatformByName,
  insertPlayerRow,
  fetchPlayerById,
  updatePlayerBalanceRow,
  insertUserLogRow,
  softDeletePlayerRow,
  upsertOrders,
  updateOrderBind,
  authSignIn,
  authSignOut,
  authGetUser,
  authRefreshToken,
  writeUserMetadata,
} = impl;

export const {
  getTeamDbScript,
  fetchAllCanonicalTeams,
  fetchAllTeamPlatformMaps,
  fetchExistingTeamMapKeys,
  loadTeamMapsForMatcher,
  fetchTeamPlatformMap,
  countTeamMapsForGbId,
  reassignGbTeamId,
  upsertTeamPlatformMaps,
  upsertTeamPlatformMapsBatched,
  upsertCanonicalTeams,
  nextManualGbTeamId,
  fetchCanonicalTeamExact,
  findCanonicalTeamByNormalizedName,
  updateCanonicalTeamById,
  insertCanonicalTeam,
  saveTeamMappingFireAndForget,
} = team;

export {
  STALE_MS,
  DEFAULT_PRUNE_INTERVAL_MS,
  getStaleCutoffMs,
  pruneStaleRows,
  formatPruneCounts,
} from "./prune_stale.js";

export {
  CLIENT_MATCH_LIST_HIDDEN,
  CLIENT_MATCH_LIST_DEFAULT,
  isClientMatchListVisible,
} from "./client_match_list_status.js";

export {
  isMatcherStoreReady,
  getClientMatchIdAdapter,
  fetchClientMatchIdIndex,
  findClientMatchIdByMergeKey,
  insertClientMatchStub,
  fetchPlatformMatchRow,
  fetchClientMatchRow,
  fetchPlatformMatchesHomeAway,
  fetchPlatformMatchesDashboard,
  fetchClientMatchesDashboard,
  fetchClientMatchesHidden,
  fetchLatestClientMatchBuiltAt,
  fetchPlatformMatchesDebugRows,
  fetchPlatformMatchesByClientMatchId,
  updatePlatformMatchMatchId,
  reassignPlatformMatchIds,
  deletePlatformMatchRow,
  deleteClientMatchRow,
  setClientMatchListStatus,
} from "./matcher_store.js";

export {
  initDatabaseUrl,
  buildPgClientConfig,
  wantsPgSsl,
  getDatabaseUrlCandidates,
  hasDatabaseUrlConfig,
  getResolvedDatabaseUrl,
  getResolvedDatabaseLabel,
} from "./resolve_database_url.js";

export { getPgPool, ensurePgPoolReady } from "./pg_pool.js";

export { migratePlayersJsonToRds } from "./players_json_migrate.js";
