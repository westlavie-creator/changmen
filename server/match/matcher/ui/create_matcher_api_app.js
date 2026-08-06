import { createRequire } from "node:module";
import { isMatcherStoreReady } from "@changmen/db";
import express from "express";
import { isMatcherSkipAuthEnabled } from "../lib/config.js";
import { registerMatcherApiRoutes } from "./api_routes.js";
import { createMatcherAuthMiddleware } from "./matcher_auth.js";
import "../lib/env.js";

const require = createRequire(import.meta.url);
let cachedApp = null;

function assertIconvLite() {
  try {
    require.resolve("iconv-lite/encodings");
  }
  catch (err) {
    console.error(
      "[matcher] 依赖不完整（iconv-lite），POST API 不可用。请在 changmen/server/matcher 执行: npm install",
    );
    console.error("[matcher]", err.message);
    throw err;
  }
}

export function createMatcherApiApp() {
  if (cachedApp)
    return cachedApp;

  assertIconvLite();

  if (!isMatcherStoreReady()) {
    console.warn("[matcher] 数据库未配置，/matcher/api 将不可用");
  }
  else if (isMatcherSkipAuthEnabled()) {
    console.warn("[matcher] MATCHER_SKIP_AUTH=1：/matcher/api 鉴权已跳过（非 production）");
  }

  const app = express();
  app.use(express.json());
  app.use(createMatcherAuthMiddleware());
  if (isMatcherStoreReady())
    registerMatcherApiRoutes(app);
  app.use((err, req, res, _next) => {
    console.error("[matcher] request error:", err.message);
    if (!res.headersSent) {
      res.status(500).json({ ok: false, error: err.message });
    }
  });

  cachedApp = app;
  return app;
}
