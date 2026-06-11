"use strict";

const store = require("../../gamebet_backend/core/esport-api/store.js");

function isLocalRequest(req) {
  const host = String(req?.headers?.host || "").split(":")[0].toLowerCase();
  return host === "localhost" || host === "127.0.0.1";
}

function isMatcherAuthBypassed(req) {
  if (process.env.MATCHER_SKIP_AUTH === "1") return true;
  if (process.env.NODE_ENV === "development") return true;
  if (req && isLocalRequest(req)) return true;
  return false;
}

function getRequestToken(req) {
  return (
    (typeof req.headers.token === "string" && req.headers.token) ||
    (typeof req.headers.Token === "string" && req.headers.Token) ||
    ""
  );
}

async function isMatcherAuthed(req) {
  if (isMatcherAuthBypassed(req)) return true;
  const user = await store.getUserBySupabaseToken(getRequestToken(req));
  return !!user;
}

function createMatcherAuthMiddleware() {
  return async (req, res, next) => {
    const path = req.path || (req.url || "").split("?")[0];
    if (!path.startsWith("/api/") && path !== "/api") return next();
    if (await isMatcherAuthed(req)) return next();
    res.status(401).json({ ok: false, error: "unauthorized", login: "/login" });
  };
}

module.exports = {
  isMatcherAuthBypassed,
  getRequestToken,
  isMatcherAuthed,
  createMatcherAuthMiddleware,
};
