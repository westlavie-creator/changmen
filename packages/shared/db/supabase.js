/**
 * 数据层入口 — 按 GAMEBET_DB_SCRIPT 转发到 impl_supabase 或 impl_rds。
 * 启动脚本须在 import 本模块前设置 process.env.GAMEBET_DB_SCRIPT。
 */

const script = String(process.env.GAMEBET_DB_SCRIPT || "supabase").trim().toLowerCase();
const impl =
  script === "rds"
    ? await import("./impl_rds.js")
    : await import("./impl_supabase.js");

if (script !== "rds" && script !== "supabase") {
  console.warn(`[db] 未知 GAMEBET_DB_SCRIPT=${script}，使用 impl_supabase`);
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
  fetchOrdersByDate,
  fetchOrdersByPlayer,
  fetchProfilesAdmin,
  fetchOrdersAdminStats,
  fetchOrdersAdminPage,
  fetchOrdersForProfitAggregate,
  upsertOrders,
  updateOrderBind,
  authSignIn,
  authSignOut,
  authGetUser,
  writeUserMetadata,
} = impl;
