"use strict";

require("../lib/env");

const express = require("express");
const { getMatcherSupabase } = require("../lib/supabase");
const { registerMatcherApiRoutes } = require("./api_routes");
const { registerMatcherLoginRoute, createMatcherAuthMiddleware } = require("./matcher_auth");

const cachedApps = new Map();

function assertIconvLite() {
  try {
    require.resolve("iconv-lite/encodings");
  } catch (err) {
    console.error(
      "[matcher] 依赖不完整（iconv-lite），POST API 不可用。请在 changmen/gamebet_matcher 执行: npm install",
    );
    console.error("[matcher]", err.message);
    throw err;
  }
}

function createMatcherApiApp({ cookiePath = "/" } = {}) {
  if (cachedApps.has(cookiePath)) return cachedApps.get(cookiePath);

  assertIconvLite();

  const supabase = getMatcherSupabase();
  if (!supabase) {
    console.warn("[matcher] Supabase 未配置，/matcher/api 将不可用");
  }

  const app = express();
  app.use(express.json());
  registerMatcherLoginRoute(app, { cookiePath });
  app.use(createMatcherAuthMiddleware());
  if (supabase) registerMatcherApiRoutes(app, supabase);
  app.use((err, req, res, _next) => {
    console.error("[matcher] request error:", err.message);
    if (!res.headersSent) {
      res.status(500).json({ ok: false, error: err.message });
    }
  });

  cachedApps.set(cookiePath, app);
  return app;
}

module.exports = { createMatcherApiApp };
