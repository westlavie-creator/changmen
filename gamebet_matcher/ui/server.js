"use strict";

const path = require("path");
require("../lib/env");

const express = require("express");
const { getMatcherSupabase } = require("../lib/supabase");
const { registerMatcherApiRoutes } = require("./api_routes");
const {
  registerMatcherLoginRoute,
  createMatcherAuthMiddleware,
  isMatcherAuthed,
} = require("./matcher_auth");

const PORT = Number(process.env.MATCHER_UI_PORT || process.env.PIPEI_PORT || 4567);
const supabase = getMatcherSupabase();
if (!supabase) {
  console.warn("[matcher] Supabase 未配置，API 将不可用");
}

try {
  require.resolve("iconv-lite/encodings");
} catch (err) {
  console.error(
    "[matcher] 依赖不完整（iconv-lite），POST API 不可用。请在 changmen/gamebet_matcher 执行: npm install",
  );
  console.error("[matcher]", err.message);
  process.exit(1);
}

const app = express();
app.use(express.json());
registerMatcherLoginRoute(app, { cookiePath: "/" });
app.use(createMatcherAuthMiddleware());
if (supabase) registerMatcherApiRoutes(app, supabase);

app.use((req, res, next) => {
  if (req.path === "/login.html") return next();
  if (isMatcherAuthed(req)) return next();
  res.redirect(302, "/login.html");
});
app.use(express.static(path.join(__dirname, "public")));

app.use((err, req, res, _next) => {
  console.error("[matcher] request error:", err.message);
  if (!res.headersSent) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

app.listen(PORT, () => {
  console.log(`[matcher] http://localhost:${PORT}`);
  console.log(`[matcher] debug: http://localhost:${PORT}/api/debug`);
});
