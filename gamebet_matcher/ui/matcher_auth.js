"use strict";

const crypto = require("crypto");

const PASSWORD = process.env.MATCHER_UI_PASSWORD || "TJ01";
const COOKIE_NAME = "matcher_ui";
const AUTH_TOKEN = crypto.createHmac("sha256", PASSWORD).update("matcher-ui-v1").digest("hex");

function parseCookies(req) {
  const out = {};
  const raw = req.headers.cookie;
  if (!raw) return out;
  for (const part of raw.split(";")) {
    const i = part.indexOf("=");
    if (i < 0) continue;
    out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim());
  }
  return out;
}

function isMatcherAuthed(req) {
  return parseCookies(req)[COOKIE_NAME] === AUTH_TOKEN;
}

function buildAuthCookie(cookiePath) {
  return `${COOKIE_NAME}=${AUTH_TOKEN}; Path=${cookiePath}; HttpOnly; SameSite=Lax; Max-Age=${60 * 60 * 24 * 7}`;
}

function registerMatcherLoginRoute(app, { cookiePath = "/" } = {}) {
  app.post("/api/login", (req, res) => {
    if (req.body?.password === PASSWORD) {
      res.setHeader("Set-Cookie", buildAuthCookie(cookiePath));
      return res.json({ ok: true });
    }
    res.status(401).json({ ok: false, error: "密码错误" });
  });
}

function createMatcherAuthMiddleware() {
  return (req, res, next) => {
    const path = req.path || (req.url || "").split("?")[0];
    if (!path.startsWith("/api/") && path !== "/api") return next();
    if (path === "/api/login") return next();
    if (isMatcherAuthed(req)) return next();
    res.status(401).json({ ok: false, error: "unauthorized" });
  };
}

/** 未登录也可访问的 matcher 静态文件 */
function isMatcherPublicStatic(fileRel) {
  const name = String(fileRel || "").replace(/^\//, "");
  return name === "login.html";
}

module.exports = {
  isMatcherAuthed,
  registerMatcherLoginRoute,
  createMatcherAuthMiddleware,
  isMatcherPublicStatic,
};
