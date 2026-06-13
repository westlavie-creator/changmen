/**
 * 数据层唯一入口 — 所有数据库读写、运维对账、连接初始化均从此文件 import。
 * 内部按 GAMEBET_DB_SCRIPT 路由到 RDS（pg）或 Supabase；业务代码勿直连 client / impl / team_store / matcher_store。
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

import "./load_env.js";

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
  COMPARE_DUAL_TABLES,
  compareDualRowCounts,
  formatCompareDualOneLine,
  formatCompareDualReport,
} from "./compare_dual.js";

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
  fetchLatestClientMatchBuiltAt,
  fetchPlatformMatchesDebugRows,
  fetchPlatformMatchesByClientMatchId,
  updatePlatformMatchMatchId,
  reassignPlatformMatchIds,
  deletePlatformMatchRow,
  deleteClientMatchRow,
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

/** 迁移脚本专用：读 Supabase 源库（不经 RDS 路由） */
export { supabaseAdmin as getSupabaseAdminClient } from "./client.js";
