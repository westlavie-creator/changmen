import type { EsportAction } from "@changmen/api-contract/actions";
import {
  GetCollectPlatformRequest,
  GetGamesRequest,
  LoginRequest,
  RefreshTokenRequest,
  SaveBetRequest,
  SaveMatchRequest,
  SaveLiveTimerRequest,
  UpdatePlatformRequest,
} from "@changmen/api-contract/schemas";
import type { IncomingMessage, ServerResponse } from "node:http";
import * as sb from "@changmen/db";
import catalog from "@changmen/shared/catalog/game_catalog.json" with { type: "json" };
import venueGames from "@changmen/shared/catalog/venue_games.json" with { type: "json" };
import { getDefaultMarketCode, getPlatformRules } from "@changmen/shared/catalog/market_catalog";
import { isWsForwardHttpPath } from "@changmen/ws-forward";
import * as accountService from "../account/account_service.js";
import * as accountStore from "../account/account_store.js";
import { assertProfileActive } from "../account/admin_service.js";
import * as adminService from "../account/admin_service.js";
import { getMonthReport } from "../account/report_service.js";
import { normalizeClientIp, recordUserLastLogin } from "../account/user_login_meta.js";
import { touchUserPresence } from "../account/user_presence.js";
import { checkActionAuth } from "../auth/action_permissions.js";
import { isAdminUser } from "../auth/admin_auth.js";
import { getVisibleUserIds } from "../auth/role_filter.js";
import * as dbStore from "../db/store.js";
import { resolveA8Credentials } from "../integrations/a8/config.js";
import { requirePlatform } from "../shared/adapter_paths.js";
import { handleCommonApi } from "./hg_follow.js";
import store from "./store.js";
import { handleSendMessage as sendTelegramMessage } from "./telegram_send.js";
import { handleV4Request } from "./v4_router.js";

export type { EsportAction } from "@changmen/api-contract/actions";

// ?? Types ????????????????????????????????????????????????????????????????????

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

export interface EsportUser {
  id: string;
  userName: string;
  isAdmin?: boolean;
  role?: string;
  teamId?: string | null;
  setting?: Record<string, unknown>;
}

interface EsportContext {
  token: string;
  user: EsportUser | null;
}

function requireActionAuth(
  action: EsportAction | string,
  ctx: EsportContext,
): ApiFailure | null {
  const result = checkActionAuth(action, ctx.user);
  return result as ApiFailure | null;
}

// ?? Helpers ??????????????????????????????????????????????????????????????????

function ok<T>(info: T, msg = "ok"): ApiSuccess<T> {
  return { success: 1, msg, info: info ?? null };
}

function fail(msg: string, info = null): ApiFailure {
  return { success: 0, msg, info };
}

function getJwtClaim(token: string, claim: string): unknown {
  try {
    return JSON.parse(Buffer.from(token.split(".")[1], "base64url").toString())[claim];
  }
  catch {
    return null;
  }
}

function authNotConfiguredMessage(): string {
  return "未配置 JWT：请在 server/backend/.env 设置 JWT_SECRET，并配置 DATABASE_URL";
}

function profileLoadFailMessage(): string {
  return "加载用户失败，请检查 RDS profiles 连接";
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
  if (ct.includes("application/x-www-form-urlencoded"))
    return parseFormBody(raw);
  if (ct.includes("application/json")) {
    try { return raw ? JSON.parse(raw) : {}; }
    catch { return {}; }
  }
  if (raw.includes("="))
    return parseFormBody(raw);
  return raw ? { _raw: raw } : {};
}

function actionFromUrl(urlPath: string): string {
  const base = urlPath.replace(/^\/esport\/?/, "").split("?")[0];
  return base.replace(/^\//, "");
}

function gamesForProvider(provider: string): string[] {
  const fromVenueGames = (venueGames as { providers?: Record<string, unknown> }).providers?.[provider];
  if (Array.isArray(fromVenueGames))
    return [...new Set(fromVenueGames.filter(Boolean).map(String))];

  const ids = new Set<string>();
  for (const game of catalog.games || []) {
    const id = game.platforms?.[provider];
    if (id)
      ids.add(String(id));
  }
  return [...ids];
}

// ?? Action handlers ??????????????????????????????????????????????????????????

function clientIpFromRequest(req?: IncomingMessage): string {
  if (!req)
    return "";
  const raw
    = (req.headers["x-forwarded-for"] as string | undefined)?.split(",")[0]?.trim()
      || req.socket?.remoteAddress
      || "";
  return normalizeClientIp(raw);
}

async function handleClientLogin(
  body: Record<string, unknown>,
  clientIp = "",
): Promise<ApiEnvelope> {
  const parsed = LoginRequest.safeParse({ userName: body.userName || body.username, password: body.password });
  if (!parsed.success)
    return fail("用户名或密码不能为空");
  const { userName, password } = parsed.data;
  if (!sb.isAuthConfigured()) {
    return fail(authNotConfiguredMessage());
  }

  const auth = await sb.authSignIn(userName, password);
  if (auth && "error" in auth && auth.error === "db") {
    return fail("数据库连接失败，请检查 DATABASE_URL 配置");
  }
  if (!auth || "error" in auth)
    return fail("用户名或密码错误");

  const { accessToken, refreshToken, userId: uid, email } = auth;

  let profile = await dbStore.loadProfileById(uid);
  if (!profile) {
    const inferredName = (email as string).split("@")[0];
    const now = Date.now();
    const ok2 = await sb.insertProfile(uid, {
      id: uid,
      user_name: inferredName,
      accounts: [],
      betting_config: {},
      collect_config: {},
      preferences: {},
      created_at: now,
      updated_at: now,
    });
    if (ok2)
      profile = await dbStore.loadProfileById(uid);
  }
  if (!profile)
    return fail(profileLoadFailMessage());

  try {
    await assertProfileActive(uid);
  }
  catch (err) {
    return fail((err as Error).message || "账号状态异常，请联系管理员");
  }

  touchUserPresence(uid);
  await recordUserLastLogin(uid, clientIp);

  return ok({ token: accessToken, refreshToken, userName: profile.userName, ID: uid });
}

async function handle(
  action: EsportAction | string,
  body: Record<string, unknown>,
  ctx: EsportContext,
): Promise<ApiEnvelope> {
  const authFailure = requireActionAuth(action, ctx);
  if (authFailure)
    return authFailure;

  if (ctx.user?.id) {
    try {
      await assertProfileActive(ctx.user.id);
    }
    catch (err) {
      return fail((err as Error).message || "账号状态异常，请联系管理员");
    }
    touchUserPresence(ctx.user.id);
  }
  switch (action as EsportAction) {
    case "Client_Logout": {
      await sb.authSignOut(ctx.token);
      return ok(null);
    }
    case "Client_RefreshToken": {
      const rtParsed = RefreshTokenRequest.safeParse(body);
      if (!rtParsed.success)
        return fail("缺少 refreshToken");
      const refreshToken = rtParsed.data.refreshToken || rtParsed.data.refresh_token;
      const auth = await sb.authRefreshToken(String(refreshToken));
      if (auth && "revoked" in auth && auth.revoked) {
        return fail("会话已失效，请重新登录");
      }
      if (!auth || !("accessToken" in auth))
        return fail("刷新 token 失败");
      try {
        await assertProfileActive(auth.userId);
      }
      catch (err) {
        return fail((err as Error).message || "账号状态异常，请联系管理员");
      }
      touchUserPresence(auth.userId);
      return ok({ token: auth.accessToken, refreshToken: auth.refreshToken });
    }
    case "Client_GetUserInfo": {
      return ok({
        ID: ctx.user.id,
        UserName: ctx.user.userName,
        Setting: ctx.user.setting || {},
        CreditPlateUserName: resolveCreditPlateUserName(ctx.user),
        IsAdmin: isAdminUser(ctx.user),
        Role: ctx.user.role || "user",
        TeamId: ctx.user.teamId || null,
      });
    }
    case "Client_UpdateSetting": {
      let patch = body.setting ?? body;
      if (typeof patch === "string") {
        try { patch = JSON.parse(patch); }
        catch { return fail("invalid setting json"); }
      }
      if (!patch || typeof patch !== "object" || Array.isArray(patch))
        return fail("setting required");
      const user = store.updateUserSetting(ctx.user.id, patch);
      if (!user)
        return fail("user not found");
      return ok(user.setting || {});
    }
    case "Client_GetCollectPlatform": {
      const cpParsed = GetCollectPlatformRequest.safeParse(body);
      const provider = cpParsed.success ? cpParsed.data.provider : String(body.provider || "");
      const row = store.getPlatform(provider);
      const catalogBetName = getPlatformRules(provider, getDefaultMarketCode())?.betName || ".*";
      if (!row)
        return ok({ Gateway: "", Token: "", BetName: catalogBetName });

      const betName = row.betName && row.betName !== ".*" ? row.betName : catalogBetName;
      let gateway: string = row.gateway || "";
      let token: string = row.token || "";

      if (provider === "Stake") {
        gateway = row.gateway || row.apiUrl || "https://stake.com";
        token = row.accessToken || row.token || "";
      }
      if (provider.toUpperCase() === "TF") {
        try {
          const { getTfA8CollectCredentials } = requirePlatform("TF", "node", "collect_credentials.js");
          const a8 = await getTfA8CollectCredentials();
          store.setPlatform("TF", {
            gateway: a8.gateway,
            token: a8.token,
            betName: a8.betName || betName,
            games: a8.games,
          });
          return ok({ Gateway: a8.gateway, Token: a8.token, BetName: a8.betName || betName });
        }
        catch (err: any) {
          console.warn("[TF] A8 Client_GetCollectPlatform failed:", err.message);
          const fallback = store.getPlatform("TF");
          if (fallback?.gateway && fallback?.token) {
            return ok({ Gateway: fallback.gateway, Token: fallback.token, BetName: fallback.betName || betName });
          }
          return ok({ Gateway: "", Token: "", BetName: catalogBetName });
        }
      }
      if (provider.toUpperCase() === "IA") {
        const { getIaA8CollectCredentials } = requirePlatform("IA", "node", "collect_credentials.js");
        const a8 = getIaA8CollectCredentials();
        return ok({
          Gateway: a8.gateway,
          Token: a8.token,
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
      const ggParsed = GetGamesRequest.safeParse(body);
      const provider = ggParsed.success ? ggParsed.data.provider : String(body.provider || "");
      const fromCatalog = gamesForProvider(provider);
      const row = store.getPlatform(provider);
      const fromPlatform: string[] = Array.isArray(row?.games) ? row.games.map(String) : [];
      return ok([...new Set([...fromCatalog, ...fromPlatform])]);
    }
    case "API_UpdatePlatform": {
      const upParsed = UpdatePlatformRequest.safeParse(body);
      if (!upParsed.success)
        return fail("provider required");
      const prev = store.getPlatform(upParsed.data.provider) || {};
      const next = store.setPlatform(upParsed.data.provider, {
        gateway: upParsed.data.gateway ?? prev.gateway ?? "",
        token: upParsed.data.token ?? prev.token ?? "",
        betName: upParsed.data.betName ?? prev.betName ?? ".*",
        games: upParsed.data.games ? JSON.parse(upParsed.data.games) : prev.games,
      });
      return ok(next);
    }
    case "API_SaveMatch": {
      const smParsed = SaveMatchRequest.safeParse(body);
      if (!smParsed.success)
        return fail("provider and matchs required");
      let matchs: unknown[] = [];
      try { matchs = JSON.parse(smParsed.data.matchs); }
      catch { return fail("invalid matchs json"); }
      store.saveMatches(smParsed.data.provider, matchs);
      return ok(true);
    }
    case "API_SaveBet": {
      const sbParsed = SaveBetRequest.safeParse(body);
      if (!sbParsed.success)
        return fail("provider, matchId and bets required");
      let bets: unknown[] = [];
      try { bets = JSON.parse(sbParsed.data.bets as string); }
      catch { return fail("invalid bets json"); }
      store.saveBets(sbParsed.data.provider, sbParsed.data.matchId, bets);
      return ok(true);
    }
    case "API_SaveLiveTimer": {
      const stParsed = SaveLiveTimerRequest.safeParse(body);
      if (!stParsed.success)
        return fail("provider and timer required");
      let timer: unknown[] = [];
      try { timer = JSON.parse(stParsed.data.timer); }
      catch { return fail("invalid timer json"); }
      await store.saveLiveTimer(stParsed.data.provider, timer);
      return ok(true);
    }
    case "Client_GetMatchs":
      return ok(await store.buildMatchList());
    case "Client_SaveData": {
      if (!body.key)
        return fail("key required");
      const saved = await accountService.handleSaveData(body.key, body.content ?? "", ctx.user.id);
      return saved.ok ? ok(saved.info) : fail(saved.msg);
    }
    case "Client_GetAccounts":
      return ok(await dbStore.refreshAccountsFromRdsIfEmpty(ctx.user.id));
    case "Client_SaveAccounts": {
      let accounts: unknown[] = [];
      try { accounts = JSON.parse((body.accounts as string) || "[]"); }
      catch { return fail("accounts JSON ??"); }
      const saved = await accountService.handleSaveAccounts(accounts, ctx.user.id);
      return saved.ok ? ok(saved.info) : fail(saved.msg);
    }
    case "Client_GetData": {
      if (body.key === "ACCOUNT" && ctx.user?.id) {
        await dbStore.refreshAccountsFromRdsIfEmpty(ctx.user.id);
      }
      const data = accountService.handleGetData(body.key, ctx.user.id);
      // ACCOUNT/PROXY ? key ????? JSON??? ok() ??
      // eslint-disable-next-line @typescript-eslint/no-unsafe-return
      if (Array.isArray(data.direct))
        return data.direct as any;
      if (data.direct && typeof data.direct === "object")
        return data.direct as any;
      return ok(data.info);
    }
    case "Client_GetUserDetail":
      return ok({ Id: ctx.user.id });
    case "Client_GetOrderList": {
      const page = await accountService.handleGetOrderList(body, ctx.user.id);
      return page.ok ? ok(page.info) : fail(page.msg);
    }
    case "Client_SaveOrder": {
      const saved = await accountService.handleSaveOrder(body, ctx.user.id);
      return saved.ok ? ok(saved.info) : fail(saved.msg);
    }
    case "Client_SaveOrderBind": {
      const saved = await accountService.handleSaveOrderBind(body, ctx.user.id);
      return saved.ok ? ok(saved.info) : fail(saved.msg);
    }
    case "API_SaveScore":
      return ok(true);
    case "Client_SaveMoneyLog": {
      const saved = await accountService.handleSaveMoneyLog(body, ctx.user.id);
      return saved.ok ? ok(saved.info) : fail(saved.msg);
    }
    case "Client_DeleteMoneyLog": {
      const deleted = await accountService.handleDeleteMoneyLog(body, ctx.user.id);
      return deleted.ok ? ok(deleted.info) : fail(deleted.msg);
    }
    case "Client_DeletePlayer": {
      const deleted = await accountService.handleDeletePlayer(body, ctx.user.id);
      return deleted.ok ? ok(deleted.info) : fail(deleted.msg);
    }
    case "Client_UpdateBalance": {
      const updated = await accountService.handleUpdateBalance(body, ctx.user.id);
      return updated.ok ? ok(updated.info) : fail(updated.msg);
    }
    case "Client_RefreshAccountBalance":
      return fail("已废弃：余额请由浏览器 Provider.getBalance + Client_UpdateBalance");
    case "Client_GetMoneyLogs": {
      const page = await accountService.handleGetMoneyLogs(body, ctx.user.id);
      return page.ok ? ok(page.info) : fail(page.msg);
    }
    case "Client_GetMoneyLog": {
      const row = await accountService.handleGetMoneyLog(body, ctx.user.id);
      return row.ok ? ok(row.info) : fail(row.msg);
    }
    case "Client_MonthReport":
      return ok(await getMonthReport(body.month, ctx.user.id));
    case "Client_GetUserProfit": {
      const profit = await accountService.handleGetUserProfit();
      return profit.ok ? ok(profit.info) : fail(profit.msg || "操作失败");
    }
    case "Client_AdminDashboard": {
      const date = body.date ? String(body.date) : undefined;
      return ok(await adminService.getAdminDashboard(date, ctx.user));
    }
    case "Client_AdminUsers": {
      const date = body.date ? String(body.date) : undefined;
      return ok(await adminService.listAdminUsers(date, ctx.user));
    }
    case "Client_AdminOrders": {
      return ok(await adminService.listAdminOrders(body, ctx.user));
    }
    case "Client_AdminOrdersMatrix": {
      return ok(await adminService.listAdminOrdersMatrix(body, ctx.user));
    }
    case "Client_AdminOrderLogs": {
      try {
        return ok(await adminService.listAdminOrderLogs(body, ctx.user));
      }
      catch (err) {
        return fail((err as Error).message || "查询失败");
      }
    }
    case "Client_AdminCreateUser": {
      try {
        return ok(
          await adminService.createAdminUser(
            (body.userName ?? body.username) as string,
            body.password as string,
          ),
        );
      }
      catch (err) {
        return fail((err as Error).message || "操作失败");
      }
    }
    case "Client_AdminResetPassword": {
      try {
        return ok(
          await adminService.resetAdminUserPassword(
            (body.userId ?? body.id) as string,
            body.password as string,
            ctx.user,
          ),
        );
      }
      catch (err) {
        return fail((err as Error).message || "操作失败");
      }
    }
    case "Client_AdminRenameUser": {
      try {
        return ok(
          await adminService.renameAdminUser(
            (body.userId ?? body.id) as string,
            (body.userName ?? body.username) as string,
            ctx.user,
          ),
        );
      }
      catch (err) {
        return fail((err as Error).message || "操作失败");
      }
    }
    case "Client_AdminSetUserAdmin": {
      try {
        const isAdmin
          = body.isAdmin === true || body.isAdmin === 1 || body.isAdmin === "1";
        return ok(
          await adminService.setAdminUserAdmin(
            (body.userId ?? body.id) as string,
            isAdmin,
            ctx.user.id,
          ),
        );
      }
      catch (err) {
        return fail((err as Error).message || "操作失败");
      }
    }
    case "Client_AdminSetUserRole": {
      try {
        return ok(
          await adminService.setAdminUserRole(
            (body.userId ?? body.id) as string,
            body.role as string,
            (body.teamId ?? null) as string | null,
            ctx.user.id,
          ),
        );
      }
      catch (err) {
        return fail((err as Error).message || "设置失败");
      }
    }
    case "Client_AdminTeams": {
      return ok(await adminService.listTeams());
    }
    case "Client_AdminUpsertTeam": {
      try {
        return ok(await adminService.upsertTeam(body.id as string, body.name as string));
      }
      catch (err) {
        return fail((err as Error).message || "保存团队失败");
      }
    }
    case "Client_AdminDeleteTeam": {
      try {
        return ok(await adminService.deleteTeam((body.id ?? body.teamId) as string));
      }
      catch (err) {
        return fail((err as Error).message || "删除团队失败");
      }
    }
    case "Client_AdminDeleteUser": {
      try {
        return ok(
          await adminService.deleteAdminUser(
            (body.userId ?? body.id) as string,
            ctx.user.id,
          ),
        );
      }
      catch (err) {
        return fail((err as Error).message || "删除用户失败");
      }
    }
    case "Client_AdminDeleteOrders": {
      try {
        return ok(await adminService.deleteAdminOrders(body, ctx.user));
      }
      catch (err) {
        return fail((err as Error).message || "操作失败");
      }
    }
    case "Client_AdminMonthReport": {
      const userId = body.userId ?? body.user_id;
      const visibleIds = await getVisibleUserIds(ctx.user);
      if (visibleIds) {
        if (userId && !visibleIds.has(String(userId))) {
          return fail("无权查看该用户的报表");
        }
      }
      const uidStr = userId != null && String(userId).trim() ? String(userId) : undefined;
      const teamUserIds = !uidStr && visibleIds ? [...visibleIds] : undefined;
      return ok(
        await getMonthReport(
          body.month ? String(body.month) : undefined,
          uidStr,
          teamUserIds,
        ),
      );
    }
    case "Client_AdminPlatformAnalytics": {
      return ok(await adminService.getPlatformAnalytics(body, ctx.user));
    }
    case "Client_AdminPolymarketBuilder": {
      return ok(await adminService.getPolymarketBuilderDashboard(body, ctx.user));
    }
    case "Client_AdminValueBet": {
      const { getValueBetDashboard } = await import("./value_bet_service.js");
      return ok(await getValueBetDashboard());
    }
    case "Client_AdminUpdateAccountMultiply": {
      try {
        return ok(
          await adminService.updateAdminAccountMultiply(
            (body.userId ?? body.id) as string,
            Number(body.accountId ?? body.playerId),
            body.multiply,
            ctx.user,
          ),
        );
      }
      catch (err) {
        return fail((err as Error).message || "操作失败");
      }
    }
    case "Client_GetDefaultOdds": {
      const betId = Number(body.betId);
      const team = String(body.team || "");
      if (!betId || (team !== "Home" && team !== "Away"))
        return fail("betId / team ??");
      const odds = await store.getDefaultOddsSingle(betId, team);
      return ok({ odds });
    }
    case "Client_GetMatchDefaultOdds": {
      let matchIds: unknown[] = [];
      try { matchIds = JSON.parse((body.matchs as string) || "[]"); }
      catch { return fail("matchs JSON ??"); }
      return ok(await store.getMatchDefaultOdds(matchIds));
    }
    case "Client_CreateTagPlatform": {
      await accountStore.ensureSeed();
      const created = await accountService.handleCreateTagPlatform(body, ctx.user?.id ?? "");
      return created.ok ? ok(created.info) : fail(created.msg);
    }
    case "Client_GetTagPlatforms": {
      await accountStore.ensureSeed();
      const tags = await accountService.handleGetTagPlatforms();
      return ok(tags.info);
    }
    case "Client_GetPlayerOrder": {
      const orders = await accountService.handleGetPlayerOrder(body, ctx.user.id);
      return orders.ok ? ok(orders.info) : fail(orders.msg);
    }
    case "Client_GetUsers": {
      const users = accountService.handleGetUsers();
      return ok(users.info);
    }
    case "Client_GetChatHistory":
      return ok([]);
    case "Client_SaveUserLog": {
      const saved = await accountService.handleSaveUserLog(body, ctx.user?.id ?? "");
      return saved.ok ? ok(saved.info) : fail(saved.msg);
    }
    case "SendMessage": {
      const sent = await sendTelegramMessage(body);
      return sent.ok ? ok(true) : fail(sent.msg);
    }
    default:
      return fail(`unknown action: ${action}`);
  }
}

// ?? HTTP layer ???????????????????????????????????????????????????????????????

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
    await accountStore.ensureSeed();
    if (!action) { sendJson(res, 404, fail("missing action")); return true; }
    if (req.method !== "POST" && req.method !== "GET") {
      sendJson(res, 405, fail("method not allowed"));
      return true;
    }

    let body: Record<string, unknown> = {};
    if (req.method === "POST") {
      try { body = await parseRequest(req); }
      catch (err: any) {
        sendJson(res, 400, fail(err.message));
        return true;
      }
    }

    const token = String(req.headers.token || ""); // Node.js ???????????
    const user = await store.getUserByToken(token);

    if (action === "Client_Login") {
      sendJson(res, 200, await handleClientLogin(body, clientIpFromRequest(req)));
      return true;
    }

    sendJson(res, 200, await handle(action, body, { token, user }));
    return true;
  }
  catch (err: any) {
    console.error("[esport]", action || urlPath, err);
    if (!res.headersSent)
      sendJson(res, 200, fail(err.message || "服务器错误"));
    return true;
  }
}

function handleIp(req: IncomingMessage, res: ServerResponse): true {
  const ip
    = (req.headers["x-forwarded-for"] as string | undefined)?.split(",")[0]?.trim()
      || req.socket?.remoteAddress
      || "127.0.0.1";
  sendJson(res, 200, ok({ IP: ip, Address: ip === "127.0.0.1" ? "??" : ip }));
  return true;
}

async function handleIpAddress(req: IncomingMessage, res: ServerResponse): Promise<true> {
  if (req.method !== "POST") { sendJson(res, 405, fail("method not allowed")); return true; }
  let body: string[] = [];
  try {
    const raw = await readBody(req);
    body = raw ? JSON.parse(raw) : [];
  }
  catch { body = []; }
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
  if (isWsForwardHttpPath(urlPath))
    return false;
  if (urlPath.startsWith("/esport/"))
    return handleEsportRequest(req, res, urlPath);
  if (urlPath.startsWith("/esport-ahao/"))
    return handleEsportAhao(req, res, urlPath);
  if (urlPath.startsWith("/v4.0/"))
    return handleV4Request(req, res, urlPath);
  if (urlPath.startsWith("/common/"))
    return handleCommonApi(req, res, req.url);
  if (urlPath === "/IP" || urlPath === "/IP/Address") {
    return urlPath === "/IP/Address" ? handleIpAddress(req, res) : handleIp(req, res);
  }
  return false;
}

/**
 * IPC / ?????? ????handleEsportRequest ??????????HTTP req/res?? * ?????? ApiEnvelope????throw??
 */
export async function callEsportAction(
  action: string,
  body: Record<string, unknown>,
  token: string,
): Promise<ApiEnvelope> {
  try {
    store.ensureSeed();
    await accountStore.ensureSeed();
    // IPC ????action ????query string?? "API_SaveMatch?XBet"?????
    const cleanAction = String(action || "").split("?")[0];
    if (!cleanAction)
      return fail("missing action");
    const user = await store.getUserByToken(token);
    if (cleanAction === "Client_Login")
      return handleClientLogin(body);
    return handle(cleanAction, body || {}, { token, user });
  }
  catch (err: any) {
    console.error("[esport:ipc]", action, err);
    return fail(err.message || "服务器错误");
  }
}
