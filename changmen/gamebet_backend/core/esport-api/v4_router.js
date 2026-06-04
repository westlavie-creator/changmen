"use strict";

/** v4.0 接口 — 本地处理，不再代理到 api.a8.to */

function fail(msg, info = null) {
  return { success: 0, msg, info };
}

function ok(info = null) {
  return { success: 1, msg: "ok", info };
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
      if (raw.length > 1e6) { reject(new Error("body too large")); req.destroy(); }
    });
    req.on("end", () => resolve(raw));
    req.on("error", reject);
  });
}

function parseFormBody(raw) {
  if (!raw) return {};
  if (raw.trim().startsWith("{")) {
    try { return JSON.parse(raw); } catch { return {}; }
  }
  const out = {};
  for (const [k, v] of new URLSearchParams(raw).entries()) out[k] = v;
  return out;
}

function routePath(urlPath) {
  return urlPath.replace(/^\/v4\.0\/?/, "").replace(/^\//, "");
}

async function handleV4Request(req, res, urlPath) {
  const sub = routePath(urlPath);

  if (req.method !== "POST" && req.method !== "GET") {
    sendJson(res, 405, fail("method not allowed"));
    return true;
  }

  let rawBody = "";
  if (req.method === "POST") {
    try { rawBody = await readBody(req); }
    catch (err) { sendJson(res, 400, fail(err.message)); return true; }
  }

  const body = parseFormBody(rawBody);
  const token = req.headers.token || req.headers.Token || "";

  // ── 用户登录：走本地 store ────────────────────────────────────────────────
  if (sub === "user/account/login") {
    const { store } = require("./store.js");
    const userName = String(body.userName || body.username || "").trim();
    const password = body.password || "";
    if (!userName || !password) {
      sendJson(res, 200, fail("用户名或密码不能为空"));
      return true;
    }
    const user = store.getUserByName(userName);
    if (user?.salt) {
      const hash = store.hashPassword(password, user.salt);
      if (hash === user.passwordHash) {
        const sessionToken = store.createSession(user.id, { v4Token: sessionToken, a8UserName: userName });
        sendJson(res, 200, ok({ token: sessionToken, userName: user.userName }));
        return true;
      }
    }
    sendJson(res, 200, fail("用户名或密码错误"));
    return true;
  }

  // ── 游戏入口（credit plate PB 等）：需要 A8 v4，本地无法提供 ──────────────
  if (sub === "game/play/Login") {
    sendJson(res, 200, fail("游戏入口需配置 A8_V4_URL，当前未接入"));
    return true;
  }

  // ── 其他 v4 路径：返回空占位 ─────────────────────────────────────────────
  sendJson(res, 200, ok(null));
  return true;
}

module.exports = { handleV4Request };
