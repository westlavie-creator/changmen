import type {
  AdminAccountDetail,
  AdminDashboard,
  AdminOrderLogLookup,
  AdminOrderMatrix,
  AdminOrderPage,
  AdminOrderRow,
  AdminUserRow,
} from "@/types/admin";
import type { PlatformId } from "@/types/esport";
import type { TradeRemoteAccount } from "@/realtime/userChannel";
import type { MonthReportPayload } from "@/types/monthReport";

import { post, unwrap } from "@/api/client";

export async function getAdminDashboard(date?: string) {
  return unwrap(await post<AdminDashboard>("Client_AdminDashboard", date ? { date } : {}));
}

export async function getAdminUsers(date?: string) {
  return unwrap(await post<AdminUserRow[]>("Client_AdminUsers", date ? { date } : {}));
}

export async function getAdminOrders(body: Record<string, unknown> = {}) {
  return unwrap(await post<AdminOrderPage>("Client_AdminOrders", body));
}

/** 拉取筛选条件下当日全部订单（自动合并分页） */
export async function getAdminOrdersAll(body: Record<string, unknown> = {}) {
  const all: AdminOrderRow[] = [];
  let pageIndex = 1;
  const pageSize = 200;
  let dateKey = "";
  let total = 0;
  for (;;) {
    const page = await getAdminOrders({ ...body, pageIndex, pageSize });
    dateKey = page.date;
    total = page.total;
    all.push(...(page.list ?? []));
    if (all.length >= total || !page.list?.length)
      break;
    pageIndex += 1;
    if (pageIndex > 50)
      break;
  }
  return { date: dateKey, list: all, total };
}

/** 拉取当日全部订单（优先矩阵 API；旧后端无此 action 时分页兜底） */
export async function getAdminOrdersMatrix(body: Record<string, unknown> = {}) {
  try {
    return unwrap(await post<AdminOrderMatrix>("Client_AdminOrdersMatrix", body));
  }
  catch (e) {
    const msg = String((e as Error).message || "");
    if (!msg.includes("unknown action"))
      throw e;
    return getAdminOrdersAll(body);
  }
}

export interface AdminUserMutationResult {
  id: string;
  userName: string;
  frozen?: number;
  isAdmin?: number;
}

export async function setAdminUserAdmin(userId: string, isAdmin: boolean) {
  return unwrap(
    await post<AdminUserMutationResult>("Client_AdminSetUserAdmin", { userId, isAdmin }),
  );
}

export async function setAdminUserRole(
  userId: string,
  role: string,
  teamId?: string | null,
) {
  return unwrap(
    await post<AdminUserMutationResult>("Client_AdminSetUserRole", {
      userId,
      role,
      teamId: teamId ?? null,
    }),
  );
}

export interface TeamRow {
  id: string;
  name: string;
  created_at?: number;
  updated_at?: number;
}

export async function getTeams(): Promise<TeamRow[]> {
  return unwrap(await post<TeamRow[]>("Client_AdminTeams", {}));
}

export async function upsertTeam(id: string, name: string) {
  return unwrap(await post<TeamRow>("Client_AdminUpsertTeam", { id, name }));
}

export async function deleteTeam(id: string) {
  return unwrap(await post<{ id: string }>("Client_AdminDeleteTeam", { id }));
}

export async function deleteAdminUser(userId: string) {
  return unwrap(
    await post<AdminUserMutationResult>("Client_AdminDeleteUser", { userId }),
  );
}

export async function createAdminUser(userName: string, password: string) {
  return unwrap(
    await post<AdminUserMutationResult>("Client_AdminCreateUser", { userName, password }),
  );
}

export async function resetAdminUserPassword(userId: string, password: string) {
  return unwrap(
    await post<AdminUserMutationResult>("Client_AdminResetPassword", { userId, password }),
  );
}

export async function updateAdminAccountMultiply(body: {
  userId: string;
  accountId: number;
  multiply: number;
}) {
  return unwrap(
    await post<AdminAccountDetail>("Client_AdminUpdateAccountMultiply", body),
  );
}

export interface AdminUserSettingMutationResult {
  id: string;
  userName: string;
  betTarget?: boolean;
  setting: Record<string, unknown>;
}

export async function updateAdminUserBetTarget(userId: string, betTarget: boolean) {
  return unwrap(
    await post<AdminUserSettingMutationResult>("Client_AdminUpdateUserBetTarget", {
      userId,
      betTarget: betTarget ? 1 : 0,
    }),
  );
}

export async function getAdminUserTradeAccounts(userId: string, provider: PlatformId) {
  return unwrap(
    await post<TradeRemoteAccount[]>("Client_AdminUserTradeAccounts", { userId, provider }),
  );
}

export async function renameAdminUser(userId: string, userName: string) {
  return unwrap(
    await post<AdminUserMutationResult>("Client_AdminRenameUser", { userId, userName }),
  );
}

export async function getAdminMonthReport(month?: string, userId?: string) {
  const body: Record<string, string> = {};
  if (month)
    body.month = month;
  if (userId)
    body.userId = userId;
  return unwrap(await post<MonthReportPayload>("Client_AdminMonthReport", body));
}

export async function deleteAdminOrders(orderIds: number[]) {
  return unwrap(
    await post<{ deleted: number }>("Client_AdminDeleteOrders", { orderIds }),
  );
}

export interface PlatformAnalyticsRow {
  provider: string;
  total_orders: number;
  wins: number;
  losses: number;
  rejects: number;
  pending: number;
  total_bet: number;
  total_profit: number;
}

export interface ArbPairRow {
  provider_a: string;
  provider_b: string;
  pair_count: number;
  both_win: number;
  both_settled: number;
  has_reject: number;
  net_profit: number;
  total_bet: number;
}

export interface GameAnalyticsRow {
  game: string;
  total_orders: number;
  wins: number;
  losses: number;
  rejects: number;
  total_bet: number;
  total_profit: number;
}

export interface HourlyAnalyticsRow {
  hour: number;
  total_orders: number;
  wins: number;
  losses: number;
  total_profit: number;
  total_bet: number;
}

export interface AccountAnalyticsRow {
  player_id: number;
  provider: string;
  total_orders: number;
  wins: number;
  losses: number;
  rejects: number;
  total_bet: number;
  total_profit: number;
}

export interface ObArbOddsBucketRow {
  other_provider: string;
  ob_status: "Win" | "Lose";
  ob_odds_bucket: string;
  count: number;
  avg_ob_odds: number;
  avg_other_odds: number;
}

export interface ObArbOddsSummaryRow {
  other_provider: string;
  ob_status: "Win" | "Lose";
  count: number;
  avg_ob_odds: number;
  avg_other_odds: number;
  min_ob_odds: number;
  max_ob_odds: number;
}

export interface ObArbOddsAnalyticsPayload {
  buckets: ObArbOddsBucketRow[];
  summary: ObArbOddsSummaryRow[];
}

export interface PlatformAnalyticsPayload {
  startMs: number;
  endMs: number;
  platforms: PlatformAnalyticsRow[];
  pairs: ArbPairRow[];
  games: GameAnalyticsRow[];
  hourly: HourlyAnalyticsRow[];
  accounts: AccountAnalyticsRow[];
  obArbOdds?: ObArbOddsAnalyticsPayload;
}

export async function getAdminPlatformAnalytics(body: Record<string, unknown> = {}) {
  return unwrap(await post<PlatformAnalyticsPayload>("Client_AdminPlatformAnalytics", body));
}

export interface PolymarketBuilderTradeRow {
  id: string;
  tradeType: string;
  side: string;
  status: string;
  outcome: string;
  price: number;
  sizeShares: number;
  sizeUsdc: number;
  feeUsdc: number;
  builderFeeUsdc: number;
  /** 优先 builderFee，否则 feeUsdc */
  displayFeeUsdc: number;
  maker: string;
  /** maker 地址对应的 changmen 用户名 */
  makerUserName: string;
  owner: string;
  market: string;
  assetId: string;
  transactionHash: string;
  matchTime: number | null;
  matchTimeIso: string | null;
  builder: string;
}

export interface PolymarketChangmenOrderRow {
  orderId: string;
  userId: string;
  userName: string;
  playerId: number;
  playerName: string;
  status: string;
  betMoney: number;
  profit: number;
  message: string;
  matchTitle: string;
  betTitle: string;
  item: string;
  createAt: number;
  updateAt: number;
}

export interface PolymarketBuilderDashboardPayload {
  startMs: number;
  endMs: number;
  builderCode: string;
  relayerConfigured: boolean;
  relayerAuthMode: string | null;
  polymarket: {
    trades: PolymarketBuilderTradeRow[];
    summary: {
      tradeCount: number;
      volumeUsdc: number;
      feeUsdc: number;
      builderFeeUsdc: number;
      buyCount: number;
      sellCount: number;
    };
    pagesFetched: number;
    nextCursor: string | null;
    hasMore: boolean;
  };
  changmen: {
    orders: PolymarketChangmenOrderRow[];
    summary: {
      orderCount: number;
      totalBet: number;
      totalProfit: number;
      wins: number;
      losses: number;
      rejects: number;
      pending: number;
    };
  };
}

export async function getAdminPolymarketBuilder(body: Record<string, unknown> = {}) {
  return unwrap(await post<PolymarketBuilderDashboardPayload>("Client_AdminPolymarketBuilder", body));
}

/** Link / order_id 关联 Client_SaveUserLog（管理端诊断） */
export async function getAdminOrderLogs(body: {
  userId: string;
  linkId?: number;
  orderId?: string;
  paddingMs?: number;
}) {
  return unwrap(await post<AdminOrderLogLookup>("Client_AdminOrderLogs", body));
}
