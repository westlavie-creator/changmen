"use strict";

require("../lib/env");

const express = require("express");
const { getMatcherSupabase } = require("../lib/supabase");
const { registerMatcherApiRoutes } = require("./api_routes");
const { createMatcherAuthMiddleware } = require("./matcher_auth");

let cachedApp = null;

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

function createMatcherApiApp() {
  if (cachedApp) return cachedApp;

  assertIconvLite();

  const supabase = getMatcherSupabase();
  if (!supabase) {
    console.warn("[matcher] Supabase 未配置，/matcher/api 将不可用");
  }

  const app = express();
  app.use(express.json());
  app.use(createMatcherAuthMiddleware());
  if (supabase) registerMatcherApiRoutes(app, supabase);
  app.use((err, req, res, _next) => {
    console.error("[matcher] request error:", err.message);
    if (!res.headersSent) {
      res.status(500).json({ ok: false, error: err.message });
    }
  });

  cachedApp = app;
  return app;
}

module.exports = { createMatcherApiApp };
