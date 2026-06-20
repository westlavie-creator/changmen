/**
 * 数据层唯一入口 — 所有数据库读写均从此文件 import。
 * 内部走 RDS（pg）；业务代码勿直连 impl / rds/*_store。
 *
 * 模块地图：
 *   impl_rds.js              — facade，re-export 各 rds/*_store.js
 *   rds/orders_store.js      — orders 读写与 SaveOrderBind
 *   rds/auth_store.js          — JWT 登录/刷新/会话
 *   rds/platform_collector_store.js — SaveMatch/SaveBet/LiveTimer 采集
 *   rds/client_matches_store.js — matcher rebuild 写入 client_matches
 *   rds/profile_store.js 等  — profile / player / money_log
 *   rds/team_store.js        — canonical_teams / team_platform_maps
 *   rds/matcher_store.js     — matcher UI/ops 专用查询与运维 SQL
 *   order_link_filter — LinkID 分类（hash/套利/占位）
 *   prune_stale.js    — 过期 platform_* / client_matches 清理
 *
 * 本地 JSON / 路径见 @changmen/storage（非本包职责）。
 */

import { loadChangmenEnv } from "@changmen/storage/load_env.js";

loadChangmenEnv();

import { describeDbScript, getDbMode } from "./db_script.js";

const mode = getDbMode();

const impl = await import("./impl_rds.js");
const team = await import("./rds/team_store.js");

console.log(`[db] ${mode.script} — ${describeDbScript(mode.script)}`);

export {
  DB_SCRIPT_MODES,
  resolveDbScript,
  describeDbScript,
  getDbMode,
} from "./db_script.js";

export {
  ARB_LINK_MIN,
  placeholderLinkFromCreateAt,
  placeholderLinkFromInsertAt,
  backendBindLinkFromCreateAt,
  isHashLink,
  isCreateAtPlaceholderLink,
  isInsertTimePlaceholderLink,
  isArbBindLink,
  shouldFireOrderBoundHook,
  isPbHashOrder,
  isOrderListVisible,
  CLIENT_ORDER_LIST_SQL,
  isClientOrderListVisible,
  orderVisibleSqlAnd,
} from "./order_link_filter.js";

export {
  CHANGMEN_ORDER_LIST_SQL,
  orderChangmenBetSqlAnd,
  BET_LOG_BEFORE_MS,
  BET_LOG_AFTER_MS,
  parseBetLogData,
  isSuccessBetLogTitle,
  isSuccessCheckLogTitle,
  extractBetLogProvider,
  extractBetLogOrderId,
  betLogMatchesOrder,
  checkLogMatchesOrder,
  matchChangmenBetFromLogs,
  betLogWindowForOrders,
} from "./order_changmen_bet.js";

export const {
  isAuthConfigured,
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
  fetchClientMatchesForAlign,
  fetchClientMatchesMeta,
  initLastWrittenIds,
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
  fetchOrdersByPlayerAll,
  fetchOrdersByLink,
  fetchOrderByOrderId,
  fetchUserByName,
  fetchUserById,
  fetchProfilesAdmin,
  fetchOrdersAdminStats,
  fetchOrdersAdminPage,
  deleteOrdersByIds,
  fetchOrdersAdminAll,
  fetchOrdersForMonthAggregate,
  fetchMoneyLogsForMonthAggregate,
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
  updatePlayerDisplayName,
  updatePlayerBalanceRow,
  insertUserLogRow,
  fetchUserLogsInRange,
  softDeletePlayerRow,
  upsertOrders,
  setOrdersInsertedHook,
  setOrdersBoundHook,
  updateOrderBind,
  authSignIn,
  authSignOut,
  authGetUser,
  authRefreshToken,
  writeUserMetadata,
} = impl;

export const {
  fetchAllCanonicalTeams,
  fetchAllTeamPlatformMaps,
  fetchExistingTeamMapKeys,
  loadTeamMapsForMatcher,
  resolvePlatformMatchTeamId,
  lookupTeamMapEntry,
  isPlatformMatchRowFullyIdMapped,
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
  syncCanonicalTeamNamesFromOb,
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
  reassignPlatformMatchIds,
  deletePlatformMatchRow,
  deleteClientMatchRow,
  setClientMatchListStatus,
} from "./rds/matcher_store.js";

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
