/**
 * 数据层唯一入口 — 所有业务读写应从此文件 import，不要直连 Supabase 客户端或 team_store。
 *
 * 切换数据源（仅此一处环境变量）：
 *   GAMEBET_DB_SCRIPT=supabase | rds | dual
 *   npm run db:mode -- dual --restart
 *
 * 模式：
 *   supabase — 读写 Supabase（含队伍表）
 *   rds      — 读写 RDS
 *   dual     — 读 RDS，写 Supabase + RDS（双写）
 */

import { describeDbScript, getDbMode } from "./db_mode.js";

const mode = getDbMode();

const impl = await import(
  mode.impl === "impl_rds" ? "./impl_rds.js" : "./impl_supabase.js"
);
const team = await import("./team_store.js");

const raw = String(process.env.GAMEBET_DB_SCRIPT || "supabase").trim().toLowerCase();
if (raw !== mode.script && raw === "supabase" && mode.script === "dual") {
  console.log("[db] RDS_DUAL_WRITE=1，按 dual（双写）加载");
} else if (raw !== mode.script && !["supabase", "rds", "dual"].includes(raw)) {
  console.warn(`[db] 未知 GAMEBET_DB_SCRIPT=${raw}，使用 ${mode.script}`);
}

console.log(`[db] ${mode.script} — ${describeDbScript(mode.script)} (${mode.impl})`);

export {
  DB_SCRIPT_MODES,
  resolveDbScript,
  describeDbScript,
  usesRdsImpl,
  getDbMode,
} from "./db_mode.js";

/** 当前生效模式（进程启动时解析，与 GAMEBET_DB_SCRIPT 一致） */
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
  COMPARE_DUAL_TABLES,
  compareDualRowCounts,
  formatCompareDualOneLine,
  formatCompareDualReport,
} from "./compare_dual.js";
