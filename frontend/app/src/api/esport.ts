import type { ApiEnvelope } from "@/types/esport";
import type { AccountRecord, CreateTagPlatformResult, UpdateBalanceResult } from "@/types/account";

export type { ApiEnvelope } from "@/types/esport";
export type {
  BetRowDto,
  ClientMatchDto,
  CollectPlatformInfo,
  LoginInfo,
  OrderRow,
  PageResult,
  PlatformId,
  UserInfo,
} from "@/types/esport";

const JSON_HEADERS = { "Content-Type": "application/json" };

let authToken: string | null =
  typeof localStorage !== "undefined" ? localStorage.getItem("app:token") : null;

export function getToken(): string | null {
  return authToken;
}

export function setToken(token: string | null) {
  authToken = token;
  if (token) localStorage.setItem("app:token", token);
  else localStorage.removeItem("app:token");
}

function authHeaders(): Record<string, string> {
  return authToken ? { token: authToken } : {};
}

async function post<T>(
  action: string,
  body: Record<string, unknown> = {},
  query = "",
): Promise<ApiEnvelope<T>> {
  const res = await fetch(`/esport/${action}${query}`, {
    method: "POST",
    headers: { ...JSON_HEADERS, ...authHeaders() },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  if (!res.ok) {
    const hint = text ? `: ${text.slice(0, 160)}` : "";
    if (res.status === 502 || res.status === 503) {
      throw new Error(`后端未连接，请先运行 start-console.bat 或 start-dev.bat${hint}`);
    }
    throw new Error(`${action} HTTP ${res.status}${hint}`);
  }
  try {
    return JSON.parse(text) as ApiEnvelope<T>;
  } catch {
    throw new Error(`${action} 响应无效: ${text.slice(0, 120)}`);
  }
}

function unwrap<T>(data: ApiEnvelope<T>): T {
  if (data.success !== 1) throw new Error(data.msg || "请求失败");
  return data.info as T;
}

// --- Auth / User ---

export async function login(userName: string, password: string) {
  const data = await post<import("@/types/esport").LoginInfo>("Client_Login", {
    userName,
    password,
  });
  const info = unwrap(data);
  if (!info?.token) throw new Error(data.msg || "登录失败");
  setToken(info.token);
  return info;
}

export async function logout() {
  try {
    await post<null>("Client_Logout");
  } finally {
    setToken(null);
  }
}

export async function getUserInfo() {
  return unwrap(await post<import("@/types/esport").UserInfo>("Client_GetUserInfo"));
}

export async function getUserDetail() {
  return unwrap(await post<{ Id: number }>("Client_GetUserDetail"));
}

// --- Platform / Collect ---

export async function getCollectPlatform(provider: string) {
  const data = await post<import("@/types/esport").CollectPlatformInfo>(
    "Client_GetCollectPlatform",
    { provider },
  );
  if (data.success !== 1) return null;
  return data.info ?? null;
}

export async function getGames(provider: string) {
  const data = await post<string[]>("Client_GetGames", { provider });
  if (data.success !== 1 || !Array.isArray(data.info)) return [];
  return data.info.filter(Boolean).map(String);
}

export async function updatePlatform(body: Record<string, unknown>) {
  return unwrap(await post<unknown>("API_UpdatePlatform", body));
}

// --- Match / Bet ingest ---

export async function saveMatch(provider: string, matchs: unknown[]) {
  const data = await post<boolean>(`API_SaveMatch?${provider}`, {
    provider,
    matchs: JSON.stringify(matchs),
  });
  return data.success === 1 && data.info === true;
}

export async function saveBets(provider: string, matchId: string | number, bets: unknown[]) {
  const data = await post<boolean>(`API_SaveBet?${provider}`, {
    provider,
    matchId: String(matchId),
    bets: JSON.stringify(bets),
  });
  return data.success === 1 && data.info === true;
}

export async function saveLiveTimer(provider: string, timer: unknown[]) {
  const data = await post<boolean>(`API_SaveLiveTimer?${provider}`, {
    provider,
    timer: JSON.stringify(timer),
  });
  return data.success === 1 && data.info === true;
}

export async function saveScore(body: Record<string, unknown>) {
  return unwrap(await post<boolean>("API_SaveScore", body));
}

export async function getMatchs(userName: string) {
  const data = await post<import("@/types/esport").ClientMatchDto[]>(
    "Client_GetMatchs",
    {},
    `?user=${encodeURIComponent(userName)}`,
  );
  if (data.success !== 1 || !Array.isArray(data.info)) return [];
  return data.info;
}

// --- KV ---

export async function getClientData<T extends Record<string, unknown>>(key: string) {
  const res = await fetch("/esport/Client_GetData", {
    method: "POST",
    headers: { ...JSON_HEADERS, ...authHeaders() },
    body: JSON.stringify({ key }),
  });
  if (!res.ok) return null;
  const data = (await res.json()) as Record<string, unknown>;

  // CollectConfig / USERCONFIG：router 直接 spread 为 { success, msg, ...fields }
  if (data.success === 1) {
    if (data.info && typeof data.info === "object" && !Array.isArray(data.info)) {
      return data.info as T;
    }
    const { success: _s, msg: _m, info: _i, ...rest } = data;
    if (Object.keys(rest).length) return rest as T;
  }

  if (Array.isArray(data)) return data as unknown as T;
  if (Array.isArray(data.collect)) return data as T;
  return null;
}

/** ACCOUNT / PROXY 等数组 KV（router 直接返回 JSON 数组） */
export async function getClientDataArray<T>(key: string): Promise<T[]> {
  const res = await fetch("/esport/Client_GetData", {
    method: "POST",
    headers: { ...JSON_HEADERS, ...authHeaders() },
    body: JSON.stringify({ key }),
  });
  if (!res.ok) return [];
  const data = await res.json();
  return Array.isArray(data) ? (data as T[]) : [];
}

export async function saveClientData(key: string, content: string) {
  const data = await post<boolean>("Client_SaveData", { key, content });
  return data.success === 1;
}

export async function updateUserSetting(setting: Record<string, unknown>) {
  const data = await post<Record<string, unknown>>("Client_UpdateSetting", { setting });
  return unwrap(data);
}

// --- Orders ---

export async function getOrderList(body: Record<string, unknown> = {}) {
  const data = await post<import("@/types/esport").PageResult<import("@/types/esport").OrderRow>>(
    "Client_GetOrderList",
    body,
  );
  if (data.success !== 1) return { list: [], total: 0, pageIndex: 1, pageSize: 20 };
  return (
    data.info ?? { list: [], total: 0, pageIndex: 1, pageSize: 20 }
  );
}

export async function saveOrder(body: Record<string, unknown>) {
  return unwrap(await post<unknown>("Client_SaveOrder", body));
}

export async function saveOrderBind(body: Record<string, unknown>) {
  return unwrap(await post<boolean>("Client_SaveOrderBind", body));
}

// --- Account / Money ---

export async function updateBalance(playerId: number, balance: number) {
  return unwrap(
    await post<UpdateBalanceResult>("Client_UpdateBalance", { playerId, balance }),
  );
}

/** @deprecated 余额刷新已改为 A8 方案（浏览器 Provider + Client_UpdateBalance），保留仅供调试 */
export async function refreshAccountBalance(playerId: number) {
  const row = unwrap(
    await post<AccountRecord & { balanceError?: string | null }>("Client_RefreshAccountBalance", {
      playerId,
    }),
  );
  return {
    balance: row.balanceError ? undefined : row.balance,
    currency: row.currency,
    account: row,
    balanceError: row.balanceError ?? null,
  };
}

export async function deletePlayer(playerId: number, description = "") {
  await post<unknown>("Client_DeletePlayer", { playerId, description });
}

export async function saveMoneyLog(body: Record<string, unknown>) {
  try {
    await unwrap(await post<unknown>("Client_SaveMoneyLog", body));
    return true;
  } catch {
    return false;
  }
}

export async function deleteMoneyLog(body: Record<string, unknown>) {
  return unwrap(await post<unknown>("Client_DeleteMoneyLog", body));
}

export async function getMoneyLogs(body: Record<string, unknown> = {}) {
  return unwrap(
    await post<import("@/types/esport").PageResult<import("@/types/esport").MoneyLogRow>>(
      "Client_GetMoneyLogs",
      body,
    ),
  );
}

export async function getMoneyLog(body: Record<string, unknown>) {
  return unwrap(await post<import("@/types/esport").MoneyLogRow>("Client_GetMoneyLog", body));
}

export async function monthReport(month?: string) {
  return unwrap(await post<unknown>("Client_MonthReport", { month }));
}

export async function getUserProfit() {
  return unwrap(
    await post<import("@/types/esport").UserProfitRow[]>("Client_GetUserProfit"),
  );
}

// --- Odds defaults ---

export async function getDefaultOdds(body: Record<string, unknown>) {
  return unwrap(await post<{ odds: number }>("Client_GetDefaultOdds", body));
}

export async function getMatchDefaultOdds(body: Record<string, unknown>) {
  return unwrap(await post<Record<string, unknown>>("Client_GetMatchDefaultOdds", body));
}

// --- Tags / Players / Chat ---

export async function createTagPlatform(platformName: string, playerName: string) {
  return unwrap(
    await post<CreateTagPlatformResult>("Client_CreateTagPlatform", {
      platform: platformName,
      playerName,
    }),
  );
}

export async function getTagPlatforms() {
  return unwrap(await post<import("@/types/esport").TagPlatformRow[]>("Client_GetTagPlatforms"));
}

export async function getPlayerOrder(body: Record<string, unknown>) {
  return unwrap(
    await post<import("@/types/esport").PlayerOrderRow[]>("Client_GetPlayerOrder", body),
  );
}

export async function getUsers() {
  return unwrap(await post<import("@/types/esport").UserListRow[]>("Client_GetUsers"));
}

export async function getChatHistory(body: Record<string, unknown> = {}) {
  return unwrap(
    await post<import("@/types/esport").ChatMessageRow[]>("Client_GetChatHistory", body),
  );
}

export async function saveUserLog(body: Record<string, unknown>) {
  return unwrap(await post<boolean>("Client_SaveUserLog", body));
}

export async function sendMessage(body: Record<string, unknown>) {
  return unwrap(await post<boolean>("SendMessage", body));
}
