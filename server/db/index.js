/**
 * 数据层唯一入口 — 所有数据库读写均从此文件 import。
 * 内部走 RDS（pg）；业务代码勿直连 impl / rds/*_store。
 *
 * 模块地图：
 *   impl_rds.js              — facade，re-export 各 rds/*_store.js
 *   rds/orders_store.js      — orders 读写与 SaveOrderBind
 *   rds/auth_store.js          — JWT 登录/刷新/会话
 *   rds/platform_collector_store.js — SaveMatch/SaveBet/LiveTimer 采集
 *   rds/client_matches_store.js — matcher matchMerge 写入 client_matches
 *   rds/profile_store.js 等  — profile / player / money_log
 *   rds/team_store.js        — canonical_teams / team_platform_maps
 *   rds/matcher_store.js     — matcher UI/ops 专用查询与运维 SQL
 *   order_link_filter — LinkID 分类（hash/套利/占位）
 *   archive_stale.js  — client_matches 时间归档兜底；platform_* 由 SaveMatch 快照生命周期负责
 *
 * 本地 JSON / 路径见 @changmen/storage（非本包职责）。
 */

import { loadChangmenEnv } from "@changmen/storage/load_env.js";

import { describeDbScript, getDbMode } from "./db_script.js";

loadChangmenEnv();

const mode = getDbMode();

const impl = await import("./impl_rds.js");
const team = await import("./rds/team_store.js");

console.log(`[db] ${mode.script} — ${describeDbScript(mode.script)}`);

export {
  CLIENT_MATCH_LIST_DEFAULT,
  CLIENT_MATCH_LIST_HIDDEN,
  isClientMatchListVisible,
} from "./client_match_list_status.js";

export {
  DB_SCRIPT_MODES,
  describeDbScript,
  getDbMode,
  resolveDbScript,
} from "./db_script.js";

export {
  BET_LOG_AFTER_MS,
  BET_LOG_BEFORE_MS,
  betLogMatchesOrder,
  betLogWindowForOrders,
  CHANGMEN_ORDER_LIST_SQL,
  checkLogMatchesOrder,
  extractBetLogOrderId,
  extractBetLogProvider,
  isSuccessBetLogTitle,
  isSuccessCheckLogTitle,
  matchChangmenBetFromLogs,
  orderChangmenBetSqlAnd,
  parseBetLogData,
} from "./order_changmen_bet.js";

export const {
  isAuthConfigured,
  clearPlatformMatchEventLink,
  setPlatformMatchId,
  fetchProfiles,
  fetchProfileById,
  writeProfile,
  insertProfile,
  updateUserName,
  updateUserIsAdmin,
  updateUserRole,
  updateUserTeamId,
  fetchTeams,
  upsertTeam,
  deleteTeam,
  writeAccounts,
  writeClientMatches,
  writeClientMatchesAsync,
  fetchClientMatches,
  fetchClientMatchesForAlign,
  fetchClientMatchesMeta,
  initLastWrittenIds,
  resolveClientMatchIdForPmSport,
  updateClientMatchPmSport,
  fetchPmSportByClientMatchIds,
  fetchLinkedPolymarketPlatformMatches,
  fetchPlatformCollectorMeta,
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
  fetchPlatformAnalytics,
  fetchArbPairAnalytics,
  fetchGameAnalytics,
  fetchHourlyAnalytics,
  fetchAccountAnalytics,
  fetchObArbOddsAnalytics,
  fetchPolymarketOrdersInRange,
  fetchMoneyLogsByPlayer,
  fetchMoneyLogById,
  fetchAllMoneyLogs,
  upsertMoneyLog,
  deleteMoneyLogById,
  deleteMoneyLogsByPlayer,
  fetchPlayerByPlatformAndName,
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

export { upsertPlatformBindings } from "./rds/pairing_store.js";
export {
  archiveAndDeleteMatchEvents,
  deleteMatchEvents,
  deleteEventBinding,
  fetchAllEventBindings,
  fetchEventBindingRow,
  fetchEventBindingsForEvents,
  fetchEventRegistryStats,
  fetchLockedMatchEventTiers,
  fetchMatchEventRow,
  fetchMatchEventsByIds,
  pruneOrphanEventBindings,
  reconcilePlatformMatchesFromRegistry,
  updateMatchEventPairingTier,
  upsertEventBindings,
  upsertMatchEvents,
} from "./rds/event_registry_store.js";

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
  ARB_LINK_MIN,
  backendBindLinkFromCreateAt,
  CLIENT_ORDER_LIST_SQL,
  isArbBindLink,
  isClientOrderListVisible,
  isCreateAtPlaceholderLink,
  isHashLink,
  isInsertTimePlaceholderLink,
  isOrderListVisible,
  isPbHashOrder,
  orderVisibleSqlAnd,
  placeholderLinkFromCreateAt,
  placeholderLinkFromInsertAt,
  shouldFireOrderBoundHook,
} from "./order_link_filter.js";

export { ensurePgPoolReady, getPgPool } from "./pg_pool.js";

export { migratePlayersJsonToRds } from "./players_json_migrate.js";

export {
  ARCHIVE_SCOPE_ALL,
  ARCHIVE_SCOPE_CLIENT,
  ARCHIVE_SCOPE_LEGACY_PLATFORM,
  ARCHIVE_STALE_MS,
  archiveStaleClientMatchRows,
  archiveStaleRows,
  DEFAULT_CLIENT_MATCH_ARCHIVE_INTERVAL_MS,
  formatArchiveCounts,
  getArchiveCutoffMs,
  resolveArchiveSpecs,
} from "./archive_stale.js";

export {
  archiveClientMatch,
  deleteClientMatchRow,
  deletePlatformMatchRow,
  fetchClientMatchesDashboard,
  fetchClientMatchesHidden,
  fetchClientMatchesHiddenCount,
  fetchClientMatchIdIndex,
  fetchClientMatchRow,
  fetchLatestClientMatchBuiltAt,
  fetchPlatformMatchesByClientMatchId,
  fetchPlatformMatchesDashboard,
  fetchPlatformMatchesDebugRows,
  fetchPlatformMatchesHomeAway,
  fetchPlatformMatchRow,
  findClientMatchIdByMergeKey,
  getClientMatchIdAdapter,
  insertClientMatchStub,
  isMatcherStoreReady,
  reassignPlatformMatchIds,
  setClientMatchPlatformReverse,
  fetchClientMatchPlatformOverrides,
  setClientMatchPlatformSideOverride,
} from "./rds/matcher_store.js";

export {
  buildPgClientConfig,
  getDatabaseUrlCandidates,
  getResolvedDatabaseLabel,
  getResolvedDatabaseUrl,
  hasDatabaseUrlConfig,
  initDatabaseUrl,
  wantsPgSsl,
} from "./resolve_database_url.js";
