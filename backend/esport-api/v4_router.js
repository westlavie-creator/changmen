"use strict";

const crypto = require("crypto");
const { tryLoadSession } = require("../platforms/pb/pb_session.js");
const { isA8AuthEnabled, resolveA8Credentials } = require("../shared/a8_config.js");
const { buildFormBody, v4Headers } = require("../shared/a8_v4_client.js");

const A8_V4_BASE = (process.env.A8_V4_URL || "https://api.a8.to/v4.0").replace(/\/+$/, "");
const A8_V4_LOCAL = process.env.A8_V4_LOCAL === "1";
const GAME_ID_PB = 3;

function pbFallbackEnabled() {
  if (isA8AuthEnabled()) return process.env.A8_V4_PB_FALLBACK === "1";
  return process.env.A8_V4_PB_FALLBACK !== "0";
}

function ok(info, msg = "ok") {
  return { success: 1, msg, info: info ?? null };
}

function fail(msg, info = null) {
  return { success: 0, msg, info };
}

function sendJson(res, status, body) {
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(body));
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let raw = "";
    req.on("data", (chunk) => {
      raw += chunk;
      if (raw.length > 1e6) {
        reject(new Error("body too large"));
        req.destroy();
      }
    });
    req.on("end", () => resolve(raw));
    req.on("error", reject);
  });
}

function parseFormBody(raw) {
  if (!raw) return {};
  const ct = raw.trim();
  if (ct.startsWith("{")) {
    try {
      return JSON.parse(raw);
    } catch {
      return {};
    }
  }
  const params = new URLSearchParams(raw);
  const out = {};
  for (const [k, v] of params.entries()) out[k] = v;
  return out;
}

function routePath(urlPath) {
  return urlPath.replace(/^\/v4\.0\/?/, "").replace(/^\//, "");
}

function isPbGameLogin(body) {
  const id = body?.gameId;
  return String(id) === String(GAME_ID_PB);
}

function resolvePbPlayUrl() {
  if (process.env.PB_PLAY_URL) return process.env.PB_PLAY_URL;
  const session = tryLoadSession();
  if (!session?.gateway) return null;
  const gateway = String(session.gateway).replace(/\/+$/, "");
  if (gateway.includes("esports-hub")) return gateway;
  return `${gateway}/zh-cn/esports-hub/master`;
}

/** 平博入口：对齐 A8，始终用 a8_constants 写死账号（忽略前端 a123456） */
function resolveV4Credentials() {
  return resolveA8Credentials();
}

function rewriteV4LoginBody() {
  const cred = resolveV4Credentials();
  return buildFormBody({
    userName: cred.userName,
    password: cred.password,
  });
}

function userNotFoundHint() {
  const cred = resolveV4Credentials();
  return (
    `A8 v4 无账号「${cred.userName}」。请修改 backend/shared/a8_constants.js 中的 A8_USER / A8_PASSWORD。`
  );
}

function tryParseJson(text) {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

async function proxyToA8(req, sub, rawBody) {
  const url = `${A8_V4_BASE}/${sub}`;
  const headers = v4Headers();
  const ct = req.headers["content-type"];
  if (ct) headers["Content-Type"] = ct;
  const token = req.headers.token || req.headers.Token;
  if (token) headers.token = token;

  const init = {
    method: req.method,
    headers,
    signal: AbortSignal.timeout(Number(process.env.A8_V4_TIMEOUT_MS || 30000)),
  };
  if (req.method === "POST") {
    init.body = rawBody || "";
  }

  const upstream = await fetch(url, init);
  const text = await upstream.text();
  return { status: upstream.status, text, contentType: upstream.headers.get("content-type") };
}

function maybePatchPbPlayResponse(text, body) {
  if (!isPbGameLogin(body) || !pbFallbackEnabled()) return text;
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch {
    return text;
  }
  const url = parsed?.info?.Url;
  const explicit = process.env.PB_PLAY_URL;
  const fallback = explicit || resolvePbPlayUrl();
  if (!fallback) return text;
  if (parsed.success !== 1 || !url || url === "about:blank") {
    parsed.success = 1;
    parsed.msg = parsed.msg || "ok";
    parsed.info = { ...(parsed.info || {}), Url: fallback, GameId: body.gameId || GAME_ID_PB };
    return JSON.stringify(parsed);
  }
  if (explicit && url !== explicit) {
    parsed.info.Url = explicit;
    return JSON.stringify(parsed);
  }
  return text;
}

function handleLocalV4(res, sub, body) {
  switch (sub) {
    case "user/account/login":
      sendJson(
        res,
        200,
        ok({
          token: crypto.randomBytes(16).toString("hex"),
          userName: body.userName || "local",
        })
      );
      return true;
    case "game/play/Login": {
      const playUrl = isPbGameLogin(body) ? resolvePbPlayUrl() : null;
      sendJson(
        res,
        200,
        ok({
          Url: playUrl || "about:blank",
          GameId: body.gameId || "",
        })
      );
      return true;
    }
    default:
      sendJson(res, 200, ok(null));
      return true;
  }
}

async function handleV4Request(req, res, urlPath) {
  const sub = routePath(urlPath);
  if (req.method !== "POST" && req.method !== "GET") {
    sendJson(res, 405, fail("method not allowed"));
    return true;
  }

  let rawBody = "";
  if (req.method === "POST") {
    try {
      rawBody = await readBody(req);
    } catch (err) {
      sendJson(res, 400, fail(err.message));
      return true;
    }
  }

  const body = parseFormBody(rawBody);

  if (A8_V4_LOCAL) {
    return handleLocalV4(res, sub, body);
  }

  let forwardBody = rawBody;
  if (sub === "user/account/login") {
    forwardBody = rewriteV4LoginBody();
  }

  try {
    const upstream = await proxyToA8(req, sub, forwardBody);
    let text = upstream.text;

    if (sub === "user/account/login") {
      const parsed = tryParseJson(text);
      if (
        parsed?.success === 0 &&
        (parsed?.info?.code === "UserNotFound" || /用户不存在/.test(parsed?.msg || ""))
      ) {
        sendJson(
          res,
          200,
          fail(userNotFoundHint(), parsed.info)
        );
        return true;
      }
    }

    if (sub === "game/play/Login") {
      text = maybePatchPbPlayResponse(text, body);
    }
    res.writeHead(upstream.status, {
      "Content-Type": upstream.contentType || "application/json; charset=utf-8",
    });
    res.end(text);
    return true;
  } catch (err) {
    if (sub === "game/play/Login" && isPbGameLogin(body) && pbFallbackEnabled()) {
      const playUrl = resolvePbPlayUrl();
      if (playUrl) {
        sendJson(res, 200, ok({ Url: playUrl, GameId: body.gameId || GAME_ID_PB }));
        return true;
      }
    }
    sendJson(res, 502, fail(`A8 v4 代理失败: ${err.message}`));
    return true;
  }
}

module.exports = { handleV4Request };
