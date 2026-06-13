import type { IncomingMessage, ServerResponse } from "http";
import catalog from "@changmen/shared/catalog/game_catalog.json" with { type: "json" };
import store from "./store.js";
import { emptyPage as _emptyPage, monthReport } from "./stubs.js";
import { handleV4Request } from "./v4_router.js";
import { handleCommonApi } from "./hg_follow.js";
import * as accountStore from "../account/account_store.js";
import * as accountService from "../account/account_service.js";
import { isAdminUser } from "../account/admin_auth.js";
import * as adminService from "../account/admin_service.js";
import { resolveA8Credentials } from "../integrations/a8/config.js";
import { loginV4 } from "../integrations/a8/v4_client.js";
import { getPlatformRules, getDefaultMarketCode } from "@changmen/shared/catalog/market_catalog.mjs";
import { requirePlatform } from "../shared/adapter_paths.js";
import * as sb from "@changmen/db";
import * as dbStore from "../db/store.js";

// ── Types ────────────────────────────────────────────────────────────────────

export interface ApiSuccess<T = unknown> {
  success: 1;
  msg: string;
  info: T | null;
}

export interface ApiFailure {
  success: 0;
  msg: string;
  info: null;
}

export type ApiEnvelope<T = unknown> = ApiSuccess<T> | ApiFailure;

/** 所有合法 action 名 — 前端 api/client.ts post() 的第一个参数 */
export type EsportAction =
  | "Client_Login"
  | "Client_Logout"
  | "Client_RefreshToken"
  | "Client_GetSupabaseConfig"
  | "Client_GetUserInfo"
  | "Client_UpdateSetting"
  | "Client_GetCollectPlatform"
  | "Client_GetGames"
  | "API_UpdatePlatform"
  | "API_SaveMatch"
  | "API_SaveBet"
  | "API_SaveLiveTimer"
  | "Client_GetMatchs"
  | "Client_SaveData"
  | "Client_GetAccounts"
  | "Client_SaveAccounts"
  | "Client_GetData"
  | "Client_GetUserDetail"
  | "Client_GetOrderList"
  | "Client_SaveOrder"
  | "Client_SaveOrderBind"
  | "API_SaveScore"
  | "Client_SaveMoneyLog"
  | "Client_DeleteMoneyLog"
  | "Client_DeletePlayer"
  | "Client_UpdateBalance"
  | "Client_RefreshAccountBalance"
  | "Client_GetMoneyLogs"
  | "Client_GetMoneyLog"
  | "Client_MonthReport"
  | "Client_GetUserProfit"
  | "Client_AdminDashboard"
  | "Client_AdminUsers"
  | "Client_AdminOrders"
  | "Client_AdminCreateUser"
  | "Client_AdminResetPassword"
  | "Client_GetDefaultOdds"
  | "Client_GetMatchDefaultOdds"
  | "Client_CreateTagPlatform"
  | "Client_GetTagPlatforms"
  | "Client_GetPlayerOrder"
  | "Client_GetUsers"
  | "Client_GetChatHistory"
  | "Client_SaveUserLog"
  | "SendMessage";

export interface EsportUser {
  id: string;
  userName: string;
  setting?: Record<string, unknown>;
}

interface EsportContext {
  token: string;
  user: EsportUser | null;
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function ok<T>(info: T, msg = "ok"): ApiSuccess<T> {
  return { success: 1, msg, info: info ?? null };
}

function fail(msg: string, info = null): ApiFailure {
  return { success: 0, msg, info };
}

function getJwtClaim(token: string, claim: string): unknown {
  try {
    return JSON.parse(Buffer.from(token.split(".")[1], "base64url").toString())[claim];
  } catch {
    return null;
  }
}

function isJwtAuthMode(): boolean {
  return String(process.env.AUTH_MODE || "supabase").trim().toLowerCase() === "jwt";
}

function authNotConfiguredMessage(): string {
  if (isJwtAuthMode()) {
    return "未配置 JWT 登录：请在 apps/backend/.env 设置 AUTH_MODE=jwt、JWT_SECRET（至少16字符）及 DATABASE_URL";
  }
  return "未连接 Supabase：请在 apps/backend/.env 配置 SUPABASE_URL、SUPABASE_KEY";
}

function profileLoadFailMessage(): string {
  return isJwtAuthMode()
    ? "用户数据加载失败，请检查 RDS profiles 表"
    : "用户数据加载失败，请检查 Supabase profiles 表";
}

export function resolveCreditPlateUserName(user: EsportUser | null): string {
  const fromSetting = user?.setting?.a8UserName;
  if (fromSetting && String(fromSetting).trim()) {
    return String(fromSetting).trim();
  }
  const name = user?.userName && String(user.userName).trim();
  if (name && name !== "admin") {
    return name;
  }
  return resolveA8Credentials().userName;
}

function parseFormBody(raw: string): Record<string, string> {
  const params = new URLSearchParams(raw);
  const out: Record<string, string> = {};
  for (const [k, v] of params.entries()) out[k] = v;
  return out;
}

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    let raw = "";
    req.on("data", (chunk: Buffer) => {
      raw += chunk;
      if (raw.length > 5e6) {
        reject(new Error("body too large"));
        req.destroy();
      }
    });
    req.on("end", () => resolve(raw));
    req.on("error", reject);
  });
}

async function parseRequest(req: IncomingMessage): Promise<Record<string, unknown>> {
  const raw = await readBody(req);
  const ct = String(req.headers["content-type"] || "");
  if (ct.includes("application/x-www-form-urlencoded")) return parseFormBody(raw);
  if (ct.includes("application/json")) {
    try { return raw ? JSON.parse(raw) : {}; } catch { return {}; }
  }
  if (raw.includes("=")) return parseFormBody(raw);
  return raw ? { _raw: raw } : {};
}

function actionFromUrl(urlPath: string): string {
  const base = urlPath.replace(/^\/esport\/?/, "").split("?")[0];
  return base.replace(/^\//, "");
}

function gamesForProvider(provider: string): string[] {
  const ids = new Set<string>();
  for (const game of catalog.games || []) {
    const id = game.platforms?.[provider];
    if (id) ids.add(String(id));
  }
  return [...ids];
}

// ── Action handlers ──────────────────────────────────────────────────────────

async function handleClientLogin(body: Record<string, unknown>): Promise<ApiEnvelope> {
  const userName = String(body.userName || body.username || "").trim();
  const password = body.password;
  if (!userName || !password) return fail("用户名和密码必填");
  if (!sb.isAuthConfigured()) {
    return fail(authNotConfiguredMessage());
  }

  const auth = await sb.authSignIn(userName, password);
  if (!auth) return fail("用户名或密码错误");

  const { accessToken, refreshToken, userId: uid, email } = auth;

  let profile = await dbStore.loadProfileById(uid);
  if (!profile) {
    const inferredName = (email as string).split("@")[0];
    const now = Date.now();
    const ok2 = await sb.insertProfile(uid, {
      id: uid, user_name: inferredName,
      accounts: [], betting_config: {}, collect_config: {},
      preferences: {}, created_at: now, updated_at: now,
    });
    if (ok2) profile = await dbStore.loadProfileById(uid);
  }
  if (!profile) return fail(profileLoadFailMessage());

  const sessionId = getJwtClaim(accessToken, "session_id");
  if (sessionId) {
    sb.writeUserMetadata(uid, { active_session_id: sessionId });
  }

  return ok({ token: accessToken, refreshToken, userName: profile.userName, ID: uid });
}

async function handle(
  action: EsportAction | string,
  body: Record<string, unknown>,
  ctx: EsportContext,
): Promise<ApiEnvelope> {
  switch (action as EsportAction) {
    case "Client_Logout": {
      await sb.authSignOut(ctx.token);
      return ok(null);
    }
    case "Client_RefreshToken": {
      const refreshToken = body.refreshToken ?? body.refresh_token;
      if (!refreshToken) return fail("缺少 refreshToken");
      const auth = await sb.authRefreshToken(String(refreshToken));
      if (!auth) return fail("刷新失败，请重新登录");
      return ok({ token: auth.accessToken, refreshToken: auth.refreshToken });
    }
    case "Client_GetSupabaseConfig":
      return ok({
        url:     process.env.SUPABASE_URL  || "",
        anonKey: process.env.SUPABASE_KEY  || "",
      });
    case "Client_GetUserInfo": {
      if (!ctx.user) return fail("请先登录");
      return ok({
        ID: ctx.user.id,
        UserName: ctx.user.userName,
        Setting: ctx.user.setting || {},
        CreditPlateUserName: resolveCreditPlateUserName(ctx.user),
        IsAdmin: isAdminUser(ctx.user),
      });
    }
    case "Client_UpdateSetting": {
      if (!ctx.user) return fail("请先登录");
      let patch = body.setting ?? body;
      if (typeof patch === "string") {
        try { patch = JSON.parse(patch); } catch { return fail("invalid setting json"); }
      }
      if (!patch || typeof patch !== "object" || Array.isArray(patch)) return fail("setting required");
      const user = store.updateUserSetting(ctx.user.id, patch);
      if (!user) return fail("user not found");
      return ok(user.setting || {});
    }
    case "Client_GetCollectPlatform": {
      if (!ctx.user) return fail("请先登录");
      const provider = String(body.provider || "");
      const row = store.getPlatform(provider);
      const catalogBetName = getPlatformRules(provider, getDefaultMarketCode())?.betName || ".*";
      if (!row) return ok({ Gateway: "", Token: "", BetName: catalogBetName });

      const betName = row.betName && row.betName !== ".*" ? row.betName : catalogBetName;
      let gateway: string = row.gateway || "";
      let token: string = row.token || "";

      if (provider === "Stake") {
        gateway = row.gateway || row.apiUrl || "https://stake.com";
        token = row.accessToken || row.token || "";
      }
      if (provider.toUpperCase() === "RAY") {
        const { getRayA8CollectCredentials } = requirePlatform("RAY", "backend", "collect_credentials.js");
        const a8 = getRayA8CollectCredentials();
        return ok({ Gateway: a8.gateway, Token: a8.token, BetName: a8.betName || betName });
      }
      if (provider.toUpperCase() === "TF") {
        try {
          const { getTfA8CollectCredentials } = requirePlatform("TF", "backend", "collect_credentials.js");
          const a8 = await getTfA8CollectCredentials();
          store.setPlatform("TF", {
            gateway: a8.gateway, token: a8.token,
            betName: a8.betName || betName, games: a8.games,
          });
          return ok({ Gateway: a8.gateway, Token: a8.token, BetName: a8.betName || betName });
        } catch (err: any) {
          console.warn("[TF] A8 Client_GetCollectPlatform failed:", err.message);
          const fallback = store.getPlatform("TF");
          if (fallback?.gateway && fallback?.token) {
            return ok({ Gateway: fallback.gateway, Token: fallback.token, BetName: fallback.betName || betName });
          }
          return ok({ Gateway: "", Token: "", BetName: catalogBetName });
        }
      }
      if (provider.toUpperCase() === "IA") {
        const { getIaA8CollectCredentials } = requirePlatform("IA", "backend", "collect_credentials.js");
        const a8 = getIaA8CollectCredentials();
        return ok({
          Gateway: gateway || a8.gateway,
          Token: row ? token ?? "" : a8.token,
          BetName: betName && betName !== ".*" ? betName : a8.betName,
        });
      }
      const out: Record<string, unknown> = { Gateway: gateway, Token: token, BetName: betName };
      if (provider.toUpperCase() === "OB" && row?.gameOddTypes) {
        out.GameOddTypes = row.gameOddTypes;
      }
      return ok(out);
    }
    case "Client_GetGames": {
      if (!ctx.user) return fail("请先登录");
      const provider = String(body.provider || "");
      const fromCatalog = gamesForProvider(provider);
      const row = store.getPlatform(provider);
      const fromPlatform: string[] = Array.isArray(row?.games) ? row.games.map(String) : [];
      return ok([...new Set([...fromCatalog, ...fromPlatform])]);
    }
    case "API_UpdatePlatform": {
      if (!ctx.user) return fail("请先登录");
      const provider = body.provider;
      if (!provider) return fail("provider required");
      const prev = store.getPlatform(provider) || {};
      const next = store.setPlatform(provider, {
        gateway: body.gateway ?? prev.gateway ?? "",
        token:   body.token   ?? prev.token   ?? "",
        betName: body.betName ?? prev.betName ?? ".*",
        games:   body.games ? JSON.parse(body.games as string) : prev.games,
      });
      return ok(next);
    }
    case "API_SaveMatch": {
      if (!ctx.user) return fail("请先登录");
      const provider = body.provider;
      let matchs: unknown[] = [];
      try { matchs = JSON.parse((body.matchs as string) || "[]"); } catch { return fail("invalid matchs json"); }
      store.saveMatches(provider, matchs);
      return ok(true);
    }
    case "API_SaveBet": {
      if (!ctx.user) return fail("请先登录");
      const provider = body.provider;
      const matchId = body.matchId;
      let bets: unknown[] = [];
      try { bets = JSON.parse((body.bets as string) || "[]"); } catch { return fail("invalid bets json"); }
      store.saveBets(provider, matchId, bets);
      return ok(true);
    }
    case "API_SaveLiveTimer": {
      if (!ctx.user) return fail("请先登录");
      const provider = body.provider;
      let timer: unknown[] = [];
      try { timer = JSON.parse((body.timer as string) || "[]"); } catch { return fail("invalid timer json"); }
      store.saveLiveTimer(provider, timer);
      return ok(true);
    }
    case "Client_GetMatchs":
      if (!ctx.user) return fail("请先登录");
      return ok(await store.buildMatchList());
    case "Client_SaveData": {
      if (!ctx.user) return fail("请先登录");
      if (!body.key) return fail("key required");
      const saved = accountService.handleSaveData(body.key, body.content ?? "", ctx.user.id);
      return saved.ok ? ok(saved.info) : fail(saved.msg);
    }
    case "Client_GetAccounts":
      if (!ctx.user) return fail("请先登录");
      return ok(store.getAccountsForUser(ctx.user.id));
    case "Client_SaveAccounts": {
      if (!ctx.user) return fail("请先登录");
      let accounts: unknown[] = [];
      try { accounts = JSON.parse((body.accounts as string) || "[]"); } catch { return fail("accounts JSON 无效"); }
      if (!Array.isArray(accounts)) return fail("accounts 必须是数组");
      store.setAccountsForUser(ctx.user.id, accounts);
      return ok(true);
    }
    case "Client_GetData": {
      if (!ctx.user) return fail("请先登录");
      const data = accountService.handleGetData(body.key, ctx.user.id);
      // 故意返回裸数组/对象：前端 getClientDataArray 用 Array.isArray(data) 消费，
      // 不能包 ok()，否则破坏 ACCOUNT/PROXY 等 key 的读取。
      // eslint-disable-next-line @typescript-eslint/no-unsafe-return
      if (Array.isArray(data.direct)) return data.direct as any;
      if (data.direct && typeof data.direct === "object") return data.direct as any;
      return ok(data.info);
    }
    case "Client_GetUserDetail":
      if (!ctx.user) return fail("请先登录");
      return ok({ Id: ctx.user.id });
    case "Client_GetOrderList": {
      if (!ctx.user) return fail("请先登录");
      const page = await accountService.handleGetOrderList(body, ctx.user.id);
      return page.ok ? ok(page.info) : fail(page.msg);
    }
    case "Client_SaveOrder": {
      if (!ctx.user) return fail("请先登录");
      const saved = await accountService.handleSaveOrder(body, ctx.user.id);
      return saved.ok ? ok(saved.info) : fail(saved.msg);
    }
    case "Client_SaveOrderBind": {
      if (!ctx.user) return fail("请先登录");
      const saved = await accountService.handleSaveOrderBind(body, ctx.user.id);
      return saved.ok ? ok(saved.info) : fail(saved.msg);
    }
    case "API_SaveScore":
      if (!ctx.user) return fail("请先登录");
      return ok(true);
    case "Client_SaveMoneyLog": {
      if (!ctx.user) return fail("请先登录");
      const saved = accountService.handleSaveMoneyLog(body);
      return saved.ok ? ok(saved.info) : fail(saved.msg);
    }
    case "Client_DeleteMoneyLog": {
      if (!ctx.user) return fail("请先登录");
      const deleted = accountService.handleDeleteMoneyLog(body);
      return deleted.ok ? ok(deleted.info) : fail(deleted.msg);
    }
    case "Client_DeletePlayer": {
      if (!ctx.user) return fail("请先登录");
      const deleted = accountService.handleDeletePlayer(body, ctx.user.id);
      return deleted.ok ? ok(deleted.info) : fail(deleted.msg);
    }
    case "Client_UpdateBalance": {
      if (!ctx.user) return fail("请先登录");
      const updated = accountService.handleUpdateBalance(body);
      return updated.ok ? ok(updated.info) : fail(updated.msg);
    }
    case "Client_RefreshAccountBalance": {
      if (!ctx.user) return fail("请先登录");
      const refreshed = await accountService.handleRefreshAccountBalance(body, ctx.user.id);
      return refreshed.ok ? ok(refreshed.info) : fail(refreshed.msg);
    }
    case "Client_GetMoneyLogs": {
      if (!ctx.user) return fail("请先登录");
      const page = accountService.handleGetMoneyLogs(body);
      return page.ok ? ok(page.info) : fail(page.msg);
    }
    case "Client_GetMoneyLog": {
      if (!ctx.user) return fail("请先登录");
      const row = accountService.handleGetMoneyLog(body);
      return row.ok ? ok(row.info) : fail(row.msg);
    }
    case "Client_MonthReport":
      if (!ctx.user) return fail("请先登录");
      return ok(monthReport(body.month));
    case "Client_GetUserProfit": {
      if (!ctx.user) return fail("请先登录");
      const profit = await accountService.handleGetUserProfit();
      return profit.ok ? ok(profit.info) : fail(profit.msg || "排行榜加载失败");
    }
    case "Client_AdminDashboard": {
      if (!ctx.user) return fail("请先登录");
      if (!isAdminUser(ctx.user)) return fail("无管理员权限");
      const date = body.date ? String(body.date) : undefined;
      return ok(await adminService.getAdminDashboard(date));
    }
    case "Client_AdminUsers": {
      if (!ctx.user) return fail("请先登录");
      if (!isAdminUser(ctx.user)) return fail("无管理员权限");
      const date = body.date ? String(body.date) : undefined;
      return ok(await adminService.listAdminUsers(date));
    }
    case "Client_AdminOrders": {
      if (!ctx.user) return fail("请先登录");
      if (!isAdminUser(ctx.user)) return fail("无管理员权限");
      return ok(await adminService.listAdminOrders(body));
    }
    case "Client_AdminCreateUser": {
      if (!ctx.user) return fail("请先登录");
      if (!isAdminUser(ctx.user)) return fail("无管理员权限");
      try {
        return ok(
          await adminService.createAdminUser(
            (body.userName ?? body.username) as string,
            body.password as string,
          ),
        );
      } catch (err) {
        return fail((err as Error).message || "创建用户失败");
      }
    }
    case "Client_AdminResetPassword": {
      if (!ctx.user) return fail("请先登录");
      if (!isAdminUser(ctx.user)) return fail("无管理员权限");
      try {
        return ok(
          await adminService.resetAdminUserPassword(
            (body.userId ?? body.id) as string,
            body.password as string,
          ),
        );
      } catch (err) {
        return fail((err as Error).message || "重置密码失败");
      }
    }
    case "Client_GetDefaultOdds": {
      if (!ctx.user) return fail("请先登录");
      const betId = Number(body.betId);
      const team = String(body.team || "");
      if (!betId || (team !== "Home" && team !== "Away")) return fail("betId / team 无效");
      const odds = await store.getDefaultOddsSingle(betId, team);
      return ok({ odds });
    }
    case "Client_GetMatchDefaultOdds": {
      if (!ctx.user) return fail("请先登录");
      let matchIds: unknown[] = [];
      try { matchIds = JSON.parse((body.matchs as string) || "[]"); } catch { return fail("matchs JSON 无效"); }
      return ok(await store.getMatchDefaultOdds(matchIds));
    }
    case "Client_CreateTagPlatform": {
      if (!ctx.user) return fail("请先登录");
      accountStore.ensureSeed();
      const created = accountService.handleCreateTagPlatform(body);
      return created.ok ? ok(created.info) : fail(created.msg);
    }
    case "Client_GetTagPlatforms": {
      if (!ctx.user) return fail("请先登录");
      accountStore.ensureSeed();
      const tags = accountService.handleGetTagPlatforms();
      return ok(tags.info);
    }
    case "Client_GetPlayerOrder": {
      if (!ctx.user) return fail("请先登录");
      const orders = await accountService.handleGetPlayerOrder(body, ctx.user.id);
      return orders.ok ? ok(orders.info) : fail(orders.msg);
    }
    case "Client_GetUsers": {
      if (!ctx.user) return fail("请先登录");
      const users = accountService.handleGetUsers();
      return ok(users.info);
    }
    case "Client_GetChatHistory":
      if (!ctx.user) return fail("请先登录");
      return ok([]);
    case "Client_SaveUserLog":
    case "SendMessage":
      return ok(true);
    default:
      return fail(`unknown action: ${action}`);
  }
}

// ── HTTP layer ───────────────────────────────────────────────────────────────

function sendJson(res: ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(body));
}

export async function handleEsportRequest(
  req: IncomingMessage,
  res: ServerResponse,
  urlPath: string,
): Promise<true> {
  const action = actionFromUrl(urlPath);
  try {
    store.ensureSeed();
    accountStore.ensureSeed();
    if (!action) { sendJson(res, 404, fail("missing action")); return true; }
    if (req.method !== "POST" && req.method !== "GET") {
      sendJson(res, 405, fail("method not allowed"));
      return true;
    }

    let body: Record<string, unknown> = {};
    if (req.method === "POST") {
      try { body = await parseRequest(req); } catch (err: any) {
        sendJson(res, 400, fail(err.message));
        return true;
      }
    }

    const token = String(req.headers.token || ""); // Node.js 会将所有请求头转为小写
    const user = await store.getUserBySupabaseToken(token);

    if (action === "Client_Login") {
      sendJson(res, 200, await handleClientLogin(body));
      return true;
    }

    sendJson(res, 200, await handle(action, body, { token, user }));
    return true;
  } catch (err: any) {
    console.error("[esport]", action || urlPath, err);
    if (!res.headersSent) sendJson(res, 200, fail(err.message || "服务器错误"));
    return true;
  }
}

function handleIp(req: IncomingMessage, res: ServerResponse): true {
  const ip =
    (req.headers["x-forwarded-for"] as string | undefined)?.split(",")[0]?.trim()
    || req.socket?.remoteAddress
    || "127.0.0.1";
  sendJson(res, 200, ok({ IP: ip, Address: ip === "127.0.0.1" ? "本地" : ip }));
  return true;
}

async function handleIpAddress(req: IncomingMessage, res: ServerResponse): Promise<true> {
  if (req.method !== "POST") { sendJson(res, 405, fail("method not allowed")); return true; }
  let body: string[] = [];
  try {
    const raw = await readBody(req);
    body = raw ? JSON.parse(raw) : [];
  } catch { body = []; }
  const info: Record<string, string> = {};
  for (const ip of body) info[String(ip)] = String(ip);
  sendJson(res, 200, ok(info));
  return true;
}

function handleEsportAhao(req: IncomingMessage, res: ServerResponse, urlPath: string): true {
  if (urlPath.includes("/api/Auth/phblist")) {
    sendJson(res, 200, { users: [] });
    return true;
  }
  sendJson(res, 200, ok(null));
  return true;
}

export async function tryEsportApi(
  req: IncomingMessage,
  res: ServerResponse,
): Promise<boolean> {
  const urlPath = req.url!.split("?")[0];
  if (urlPath.startsWith("/esport/"))       return handleEsportRequest(req, res, urlPath);
  if (urlPath.startsWith("/esport-ahao/"))  return handleEsportAhao(req, res, urlPath);
  if (urlPath.startsWith("/v4.0/"))         return handleV4Request(req, res, urlPath);
  if (urlPath.startsWith("/common/"))       return handleCommonApi(req, res, req.url);
  if (urlPath === "/IP" || urlPath === "/IP/Address") {
    return urlPath === "/IP/Address" ? handleIpAddress(req, res) : handleIp(req, res);
  }
  return false;
}

/**
 * IPC / 测试直调入口 — 与 handleEsportRequest 逻辑等价，但不依赖 HTTP req/res。
 * 返回值为标准 ApiEnvelope，不会 throw。
 */
export async function callEsportAction(
  action: string,
  body: Record<string, unknown>,
  token: string,
): Promise<ApiEnvelope> {
  try {
    store.ensureSeed();
    accountStore.ensureSeed();
    // IPC 调用时 action 可能带 query string（如 "API_SaveMatch?XBet"），需剥离
    const cleanAction = String(action || "").split("?")[0];
    if (!cleanAction) return fail("missing action");
    const user = await store.getUserBySupabaseToken(token);
    if (cleanAction === "Client_Login") return handleClientLogin(body);
    return handle(cleanAction, body || {}, { token, user });
  } catch (err: any) {
    console.error("[esport:ipc]", action, err);
    return fail(err.message || "服务器错误");
  }
}
