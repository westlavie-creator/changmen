import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";
import "../lib/env.js";
import express from "express";
import { getMatcherSupabase } from "../lib/supabase.js";
import { registerMatcherApiRoutes } from "./api_routes.js";
import { createMatcherAuthMiddleware } from "./matcher_auth.js";

const require = createRequire(import.meta.url);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.MATCHER_UI_PORT || process.env.PIPEI_PORT || 4567);
const supabase = getMatcherSupabase();
if (!supabase) {
  console.warn("[matcher] Supabase 未配置，API 将不可用");
}

try {
  require.resolve("iconv-lite/encodings");
} catch (err) {
  console.error(
    "[matcher] 依赖不完整（iconv-lite），POST API 不可用。请在 changmen/apps/matcher 执行: npm install",
  );
  console.error("[matcher]", err.message);
  process.exit(1);
}

const app = express();
app.use(express.json());
app.use(createMatcherAuthMiddleware());
if (supabase) registerMatcherApiRoutes(app, supabase);
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
