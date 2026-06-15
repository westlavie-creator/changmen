import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";
import "../lib/env.js";
import { MATCHER_UI_PORT, isMatcherSkipAuthEnabled } from "../lib/config.js";
import { initDatabaseUrl, isMatcherStoreReady } from "@changmen/db";
import express from "express";
import { registerMatcherApiRoutes } from "./api_routes.js";
import { createMatcherAuthMiddleware } from "./matcher_auth.js";

const require = createRequire(import.meta.url);
const __dirname = path.dirname(fileURLToPath(import.meta.url));

await initDatabaseUrl();

const PORT = MATCHER_UI_PORT;
if (!isMatcherStoreReady()) {
  console.warn("[matcher] 数据库未配置，API 将不可用");
}

try {
  require.resolve("iconv-lite/encodings");
} catch (err) {
  console.error(
    "[matcher] 依赖不完整（iconv-lite），POST API 不可用。请在 changmen/server/matcher 执行: npm install",
  );
  console.error("[matcher]", err.message);
  process.exit(1);
}

const app = express();
app.use(express.json());
app.use(createMatcherAuthMiddleware());
if (isMatcherStoreReady()) registerMatcherApiRoutes(app);
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
  if (isMatcherSkipAuthEnabled()) {
    console.warn("[matcher] MATCHER_SKIP_AUTH=1：API 鉴权已跳过（非 production 且显式开启）");
  }
});
