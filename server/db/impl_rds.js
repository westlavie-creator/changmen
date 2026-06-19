/**
 * impl_rds — RDS 数据层 facade（按 domain 拆至 rds/*_store.js）。
 *
 * 命名约定：
 *   fetch*  — async 读取，返回数据或 null/[]
 *   write*  — fire-and-forget 写入，不阻塞调用方
 *   upsert* — async 写入，需要确认结果
 */

export {
  authSignIn,
  authSignOut,
  authGetUser,
  authRefreshToken,
  hasAdminAccess,
  isAuthConfigured,
} from "./rds/auth_store.js";

export {
  upsertOrders,
  setOrdersInsertedHook,
  setOrdersBoundHook,
  updateOrderBind,
  fetchOrdersByDate,
  fetchOrdersByPlayer,
  fetchOrdersByPlayerAll,
  fetchOrdersByLink,
  fetchOrderByOrderId,
  fetchUserByName,
  fetchUserById,
  fetchOrdersAdminStats,
  fetchOrdersAdminPage,
  deleteOrdersByIds,
  fetchOrdersAdminAll,
  fetchOrdersForMonthAggregate,
  fetchOrdersForProfitAggregate,
} from "./rds/orders_store.js";

export {
  setPlatformMatchId,
  writePlatformMatches,
  fetchPlatformMatches,
  fetchPlatformBets,
  fetchLiveTimers,
  writePlatformBets,
  replacePlatformBetsForMatch,
  writeLiveTimers,
  writeLiveTimersAsync,
  purgePlatformLiveTimers,
} from "./rds/platform_collector_store.js";

export {
  writeClientMatches,
  writeClientMatchesAsync,
  fetchClientMatches,
  fetchClientMatchesMeta,
  initLastWrittenIds,
  clearClientMatchesOnStartup,
} from "./rds/client_matches_store.js";

export {
  fetchProfiles,
  fetchProfileById,
  writeProfile,
  insertProfile,
  writeAccounts,
  fetchProfilesAdmin,
  writeUserMetadata,
  updateUserName,
  updateUserIsAdmin,
} from "./rds/profile_store.js";

export {
  fetchMoneyLogsForMonthAggregate,
  fetchMoneyLogsByPlayer,
  fetchMoneyLogById,
  fetchAllMoneyLogs,
  upsertMoneyLog,
  deleteMoneyLogById,
  deleteMoneyLogsByPlayer,
} from "./rds/money_log_store.js";

export {
  fetchTagPlatforms,
  upsertTagPlatformByName,
  insertPlayerRow,
  fetchPlayerById,
  updatePlayerBalanceRow,
  insertUserLogRow,
  fetchUserLogsInRange,
  softDeletePlayerRow,
} from "./rds/player_store.js";
