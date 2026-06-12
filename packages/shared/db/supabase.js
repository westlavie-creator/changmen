/**
 * 数据层入口 — 按 GAMEBET_DB_SCRIPT 转发到 impl_supabase 或 impl_rds。
 * 启动脚本须在 import 本模块前设置 process.env.GAMEBET_DB_SCRIPT。
 * 模式：supabase | rds | dual（双写，走 impl_rds）
 */

import { DB_SCRIPT_MODES, resolveDbScript, usesRdsImpl } from "./db_script.js";

const script = resolveDbScript();
const impl = usesRdsImpl(script)
  ? await import("./impl_rds.js")
  : await import("./impl_supabase.js");

const raw = String(process.env.GAMEBET_DB_SCRIPT || "supabase").trim().toLowerCase();
if (raw !== script && raw === "supabase" && script === "dual") {
  console.log("[db] RDS_DUAL_WRITE=1，按 dual（双写）加载 impl_rds");
} else if (!DB_SCRIPT_MODES.includes(raw) && raw !== script) {
  console.warn(`[db] 未知 GAMEBET_DB_SCRIPT=${raw}，使用 ${script}`);
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
