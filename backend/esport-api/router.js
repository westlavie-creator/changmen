"use strict";

const { URL } = require("url");
const catalog = require("../shared/game_catalog.json");
const store = require("./store.js");
const { emptyPage, monthReport } = require("./stubs.js");
const { handleV4Request } = require("./v4_router.js");
const { handleCommonApi } = require("./common_router.js");
const accountStore = require("../account/account_store.js");
const accountService = require("../account/account_service.js");
const { isA8AuthEnabled, resolveA8Credentials } = require("../shared/a8_config.js");
const { loginV4 } = require("../shared/a8_v4_client.js");
const { getPlatformRules, getDefaultMarketCode } = require("../shared/market_catalog.js");

function ok(info, msg = "ok") {
  return { success: 1, msg, info: info ?? null };
}

function fail(msg, info = null) {
  return { success: 0, msg, info };
}

function parseFormBody(raw) {
  const params = new URLSearchParams(raw);
  const out = {};
  for (const [k, v] of params.entries()) out[k] = v;
  return out;
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let raw = "";
    req.on("data", (chunk) => {
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

async function parseRequest(req) {
  const raw = await readBody(req);
  const ct = String(req.headers["content-type"] || "");
  if (ct.includes("application/x-www-form-urlencoded")) {
    return parseFormBody(raw);
  }
  if (ct.includes("application/json")) {
    try {
      return raw ? JSON.parse(raw) : {};
    } catch {
      return {};
    }
  }
  if (raw.includes("=")) return parseFormBody(raw);
  return raw ? { _raw: raw } : {};
}

function actionFromUrl(urlPath) {
  const base = urlPath.replace(/^\/esport\/?/, "").split("?")[0];
  return base.replace(/^\//, "");
}

function gamesForProvider(provider) {
  const ids = new Set();
  for (const game of catalog.games || []) {
    const id = game.platforms?.[provider];
    if (id) ids.add(String(id));
  }
  return [...ids];
}

async function handleA8Login(body = {}) {
  const defaults = resolveA8Credentials(body);
  const userName = String(body.userName || body.username || defaults.userName || "").trim();
  const password = body.password || defaults.password;
  if (!userName || !password) {
    return fail("A8 账号未配置，请编辑 shared/a8_constants.js");
  }

  let v4Result;
  try {
    v4Result = await loginV4(userName, password);
  } catch (err) {
    return fail(`A8 登录失败: ${err.message}`);
  }
  if (v4Result?.success !== 1 || !v4Result?.info?.token) {
    return fail(v4Result?.msg || "A8 用户名或密码错误");
  }

  store.ensureSeed();
  let user = store.getUserByName(userName);
  if (!user) {
    user = store.createUser(userName, password, {
      a8UserName: userName,
      a8Password: password,
    });
  } else {
    store.updateUserSetting(user.id, {
      a8UserName: userName,
      a8Password: password,
    });
    user = store.getUserById(user.id);
  }
  if (!user) return fail("创建本地用户失败");

  const token = store.createSession(user.id, {
    v4Token: v4Result.info.token,
    a8UserName: userName,
  });
  return ok({ token, userName: user.userName, ID: user.id });
}

async function handleClientLogin(body) {
  const userName = body.userName || body.username;
  const password = body.password;

  if (userName && password) {
    const user = store.getUserByName(userName);
    if (user?.salt) {
      const hash = store.hashPassword(password, user.salt);
      if (hash === user.passwordHash) {
        const token = store.createSession(user.id);
        return ok({ token, userName: user.userName, ID: user.id });
      }
    }
  }

  if (isA8AuthEnabled()) {
    return handleA8Login(body);
  }

  return fail("用户名或密码错误");
}

async function handle(action, body, ctx) {
  switch (action) {
    case "Client_Logout": {
      if (ctx.token) store.removeSession(ctx.token);
      return ok(null);
    }
    case "Client_GetUserInfo": {
      if (!ctx.user) return fail("请先登录");
      return ok({
        ID: ctx.user.id,
        UserName: ctx.user.userName,
        Setting: ctx.user.setting || {},
      });
    }
    case "Client_UpdateSetting": {
      if (!ctx.user) return fail("请先登录");
      let patch = body.setting ?? body;
      if (typeof patch === "string") {
        try {
          patch = JSON.parse(patch);
        } catch {
          return fail("invalid setting json");
        }
      }
      if (!patch || typeof patch !== "object" || Array.isArray(patch)) {
        return fail("setting required");
      }
      const user = store.updateUserSetting(ctx.user.id, patch);
      if (!user) return fail("user not found");
      return ok(user.setting || {});
    }
    case "Client_GetCollectPlatform": {
      if (!ctx.user) return fail("请先登录");
      const provider = body.provider;
      const row = store.getPlatform(provider);
      const catalogBetName =
        getPlatformRules(provider, getDefaultMarketCode())?.betName || ".*";
      if (!row) {
        return ok({
          Gateway: "",
          Token: "",
          BetName: catalogBetName,
        });
      }
      const betName =
        row.betName && row.betName !== ".*" ? row.betName : catalogBetName;
      let gateway = row.gateway || "";
      let token = row.token || "";
      if (String(provider) === "Stake") {
        gateway = row.gateway || row.apiUrl || "https://stake.com";
        token = row.accessToken || row.token || "";
      }
      if (String(provider).toUpperCase() === "RAY") {
        const { getRayA8CollectCredentials } = require("../shared/ray_a8_collect.js");
        const a8 = getRayA8CollectCredentials();
        gateway = a8.gateway;
        token = a8.token;
        return ok({
          Gateway: gateway,
          Token: token,
          BetName: a8.betName || betName,
        });
      }
      return ok({
        Gateway: gateway,
        Token: token,
        BetName: betName,
      });
    }
    case "Client_GetGames": {
      if (!ctx.user) return fail("请先登录");
      const provider = body.provider;
      const fromCatalog = gamesForProvider(provider);
      const row = store.getPlatform(provider);
      const fromPlatform = Array.isArray(row?.games) ? row.games.map(String) : [];
      const merged = [...new Set([...fromCatalog, ...fromPlatform])];
      return ok(merged);
    }
    case "API_UpdatePlatform": {
      if (!ctx.user) return fail("请先登录");
      const provider = body.provider;
      if (!provider) return fail("provider required");
      const prev = store.getPlatform(provider) || {};
      const next = store.setPlatform(provider, {
        gateway: body.gateway ?? prev.gateway ?? "",
        token: body.token ?? prev.token ?? "",
        betName: body.betName ?? prev.betName ?? ".*",
        games: body.games ? JSON.parse(body.games) : prev.games,
      });
      return ok(next);
    }
    case "API_SaveMatch": {
      if (!ctx.user) return fail("请先登录");
      const provider = body.provider;
      let matchs = [];
      try {
        matchs = JSON.parse(body.matchs || "[]");
      } catch {
        return fail("invalid matchs json");
      }
      store.saveMatches(provider, matchs);
      return ok(true);
    }
    case "API_SaveBet": {
      if (!ctx.user) return fail("请先登录");
      const provider = body.provider;
      const matchId = body.matchId;
      let bets = [];
      try {
        bets = JSON.parse(body.bets || "[]");
      } catch {
        return fail("invalid bets json");
      }
      store.saveBets(provider, matchId, bets);
      return ok(true);
    }
    case "API_SaveLiveTimer": {
      if (!ctx.user) return fail("请先登录");
      const provider = body.provider;
      let timer = [];
      try {
        timer = JSON.parse(body.timer || "[]");
      } catch {
        return fail("invalid timer json");
      }
      store.saveLiveTimer(provider, timer);
      return ok(true);
    }
    case "Client_GetMatchs": {
      if (!ctx.user) return fail("请先登录");
      return ok(store.buildMatchList());
    }
    case "Client_SaveData": {
      if (!ctx.user) return fail("请先登录");
      if (!body.key) return fail("key required");
      store.setUserKv(body.key, body.content ?? "");
      return ok(true);
    }
    case "Client_GetData": {
      if (!ctx.user) return fail("请先登录");
      const data = accountService.handleGetData(body.key);
      if (Array.isArray(data.direct)) return data.direct;
      if (data.direct && typeof data.direct === "object") return data.direct;
      return ok(data.info);
    }
    case "Client_GetUserDetail": {
      if (!ctx.user) return fail("请先登录");
      return ok({ Id: ctx.user.id });
    }
    case "Client_GetOrderList": {
      if (!ctx.user) return fail("请先登录");
      const page = accountService.handleGetOrderList(body);
      return page.ok ? ok(page.info) : fail(page.msg);
    }
    case "Client_SaveOrder": {
      if (!ctx.user) return fail("请先登录");
      const saved = accountService.handleSaveOrder(body);
      return saved.ok ? ok(saved.info) : fail(saved.msg);
    }
    case "Client_SaveOrderBind": {
      if (!ctx.user) return fail("请先登录");
      const saved = accountService.handleSaveOrderBind(body);
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
      const deleted = accountService.handleDeletePlayer(body);
      return deleted.ok ? ok(deleted.info) : fail(deleted.msg);
    }
    case "Client_UpdateBalance": {
      if (!ctx.user) return fail("请先登录");
      const updated = accountService.handleUpdateBalance(body);
      return updated.ok ? ok(updated.info) : fail(updated.msg);
    }
    case "Client_RefreshAccountBalance": {
      if (!ctx.user) return fail("请先登录");
      const refreshed = await accountService.handleRefreshAccountBalance(body);
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
    case "Client_MonthReport": {
      if (!ctx.user) return fail("请先登录");
      return ok(monthReport(body.month));
    }
    case "Client_GetUserProfit": {
      if (!ctx.user) return fail("请先登录");
      const accounts = accountStore.getAccountsFromKv();
      const rows = accounts.map((row) => ({
        UserID: row.accountId,
        UserName: row.playerName || row.platformName || String(row.accountId),
        Money: 0,
        Count: 0,
        BetMoney: 0,
      }));
      return ok(rows);
    }
    case "Client_GetDefaultOdds": {
      if (!ctx.user) return fail("请先登录");
      return ok({ odds: 0 });
    }
    case "Client_GetMatchDefaultOdds": {
      if (!ctx.user) return fail("请先登录");
      return ok({});
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
      const orders = accountService.handleGetPlayerOrder(body);
      return orders.ok ? ok(orders.info) : fail(orders.msg);
    }
    case "Client_GetUsers": {
      if (!ctx.user) return fail("请先登录");
      const users = accountService.handleGetUsers();
      return ok(users.info);
    }
    case "Client_GetChatHistory": {
      if (!ctx.user) return fail("请先登录");
      return ok([]);
    }
    case "Client_SaveUserLog":
    case "SendMessage":
      return ok(true);
    default:
      return fail(`unknown action: ${action}`);
  }
}

function sendJson(res, status, body) {
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(body));
}

async function handleEsportRequest(req, res, urlPath) {
  const action = actionFromUrl(urlPath);
  try {
    store.ensureSeed();
    accountStore.ensureSeed();
    if (!action) {
      sendJson(res, 404, fail("missing action"));
      return true;
    }
    if (req.method !== "POST" && req.method !== "GET") {
      sendJson(res, 405, fail("method not allowed"));
      return true;
    }

    let body = {};
    if (req.method === "POST") {
      try {
        body = await parseRequest(req);
      } catch (err) {
        sendJson(res, 400, fail(err.message));
        return true;
      }
    }

    const token = req.headers.token || req.headers.Token;
    const user = store.getUserByToken(token);

    if (action === "Client_Login") {
      const result = await handleClientLogin(body);
      sendJson(res, 200, result);
      return true;
    }

    const result = await handle(action, body, { token, user });
    sendJson(res, 200, result);
    return true;
  } catch (err) {
    console.error("[esport]", action || urlPath, err);
    if (!res.headersSent) {
      sendJson(res, 200, fail(err.message || "服务器错误"));
    }
    return true;
  }
}

function handleIp(req, res) {
  const ip =
    req.headers["x-forwarded-for"]?.split(",")[0]?.trim()
    || req.socket?.remoteAddress
    || "127.0.0.1";
  sendJson(res, 200, ok({ IP: ip, Address: ip === "127.0.0.1" ? "本地" : ip }));
  return true;
}

async function handleIpAddress(req, res) {
  if (req.method !== "POST") {
    sendJson(res, 405, fail("method not allowed"));
    return true;
  }
  let body = [];
  try {
    const raw = await readBody(req);
    body = raw ? JSON.parse(raw) : [];
  } catch {
    body = [];
  }
  const info = {};
  for (const ip of body) {
    info[String(ip)] = String(ip);
  }
  sendJson(res, 200, ok(info));
  return true;
}

function handleEsportAhao(req, res, urlPath) {
  if (urlPath.includes("/api/Auth/phblist")) {
    sendJson(res, 200, { users: [] });
    return true;
  }
  sendJson(res, 200, ok(null));
  return true;
}

async function tryEsportApi(req, res) {
  const urlPath = req.url.split("?")[0];
  if (urlPath.startsWith("/esport/")) {
    return handleEsportRequest(req, res, urlPath);
  }
  if (urlPath.startsWith("/esport-ahao/")) {
    return handleEsportAhao(req, res, urlPath);
  }
  if (urlPath.startsWith("/v4.0/")) {
    return handleV4Request(req, res, urlPath);
  }
  if (urlPath.startsWith("/common/")) {
    return handleCommonApi(req, res, req.url);
  }
  if (urlPath === "/IP" || urlPath === "/IP/Address") {
    if (urlPath === "/IP/Address") {
      return handleIpAddress(req, res);
    }
    handleIp(req, res);
    return true;
  }
  return false;
}

module.exports = { tryEsportApi, handleEsportRequest };
