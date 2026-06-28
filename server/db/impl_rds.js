/**
 * impl_rds — RDS 数据层 facade（按 domain 拆至 rds/*_store.js）。
 *
 * 命名约定：
 *   fetch*  — async 读取，返回数据或 null/[]
 *   write*  — fire-and-forget 写入，不阻塞调用方
 *   upsert* — async 写入，需要确认结果
 */

export {
  authGetUser,
  authRefreshToken,
  authSignIn,
  authSignOut,
  isAuthConfigured,
} from "./rds/auth_store.js";

export {
  fetchClientMatches,
  fetchClientMatchesForAlign,
  fetchClientMatchesMeta,
  initLastWrittenIds,
  writeClientMatches,
  writeClientMatchesAsync,
} from "./rds/client_matches_store.js";

export {
  deleteMoneyLogById,
  deleteMoneyLogsByPlayer,
  fetchAllMoneyLogs,
  fetchMoneyLogById,
  fetchMoneyLogsByPlayer,
  fetchMoneyLogsForMonthAggregate,
  upsertMoneyLog,
} from "./rds/money_log_store.js";

export {
  deleteOrdersByIds,
  fetchAccountAnalytics,
  fetchObArbOddsAnalytics,
  fetchArbPairAnalytics,
  fetchGameAnalytics,
  fetchHourlyAnalytics,
  fetchOrderByOrderId,
  fetchOrdersAdminAll,
  fetchOrdersAdminPage,
  fetchOrdersAdminStats,
  fetchOrdersByDate,
  fetchOrdersByLink,
  fetchOrdersByPlayer,
  fetchOrdersByPlayerAll,
  fetchOrdersForMonthAggregate,
  fetchOrdersForProfitAggregate,
  fetchPlatformAnalytics,
  fetchUserById,
  fetchUserByName,
  setOrdersBoundHook,
  setOrdersInsertedHook,
  updateOrderBind,
  upsertOrders,
} from "./rds/orders_store.js";

export {
  fetchLiveTimers,
  fetchPlatformCollectorMeta,
  fetchPlatformBets,
  fetchPlatformMatches,
  purgePlatformLiveTimers,
  replacePlatformBetsForMatch,
  setPlatformMatchId,
  writeLiveTimers,
  writeLiveTimersAsync,
  writePlatformBets,
  writePlatformMatches,
} from "./rds/platform_collector_store.js";

export {
  fetchPlayerByPlatformAndName,
  fetchPlayerById,
  fetchTagPlatforms,
  fetchUserLogsInRange,
  insertPlayerRow,
  insertUserLogRow,
  softDeletePlayerRow,
  updatePlayerBalanceRow,
  updatePlayerDisplayName,
  upsertTagPlatformByName,
} from "./rds/player_store.js";

export {
  deleteTeam,
  fetchProfileById,
  fetchProfiles,
  fetchProfilesAdmin,
  fetchTeams,
  insertProfile,
  updateUserIsAdmin,
  updateUserName,
  updateUserRole,
  updateUserTeamId,
  upsertTeam,
  writeAccounts,
  writeProfile,
  writeUserMetadata,
} from "./rds/profile_store.js";
