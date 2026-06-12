import "./load_env.js";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);

/** Electron 打包时 shared 在 resources/shared，依赖在 app.asar/node_modules */
function requireSupabaseJs() {
  try {
    return require("@supabase/supabase-js");
  } catch (err) {
    if (err.code !== "MODULE_NOT_FOUND") throw err;
  }
  const searchPaths = [];
  if (process.resourcesPath) {
    searchPaths.push(path.join(process.resourcesPath, "app.asar", "node_modules"));
  }
  searchPaths.push(
    path.join(__dirname, "..", "..", "apps", "backend", "node_modules"),
    path.join(__dirname, "..", "..", "node_modules"),
    path.join(__dirname, "..", "node_modules"),
  );
  return require(require.resolve("@supabase/supabase-js", { paths: searchPaths }));
}

// 由入口进程加载 .env（apps/matcher、apps/backend/server.js 等）
const { createClient } = requireSupabaseJs();

const sbUrl = process.env.SUPABASE_URL;
const sbKey = process.env.SUPABASE_KEY;
const sbSvc = process.env.SUPABASE_SERVICE_KEY;

function requireWsTransport() {
  if (typeof globalThis.WebSocket !== "undefined") return {};
  try {
    const ws = require(
      require.resolve("ws", {
        paths: [
          path.join(__dirname, "..", "..", "apps", "backend", "node_modules"),
          path.join(__dirname, "..", "..", "node_modules"),
        ],
      }),
    );
    return { realtime: { transport: ws } };
  } catch {
    return {};
  }
}

const supabaseClientOpts = {
  auth: {
    persistSession: false,
    autoRefreshToken: false,
    detectSessionInUrl: false,
  },
  ...requireWsTransport(),
};

// 主客户端（anon key）— 用户鉴权 + 数据读写
let supabase = null;

// 管理客户端（service_role key）— 仅用于 auth.admin API
let supabaseAdmin = null;

if (sbUrl && (sbKey || sbSvc)) {
  supabase = createClient(sbUrl, sbKey || sbSvc, supabaseClientOpts);

  if (sbSvc) {
    supabaseAdmin = createClient(sbUrl, sbSvc, supabaseClientOpts);
  }

  console.log("[db] Supabase 已连接");
} else {
  console.log("[db] 未配置 Supabase，仅使用内存存储");
}

export { supabase, supabaseAdmin };
