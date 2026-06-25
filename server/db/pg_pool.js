/**
 * RDS 连接池（@changmen/db 各 store 经 rds/common 或脚本直连）。
 */

import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  buildPgClientConfig,
  getResolvedDatabaseUrl,
  initDatabaseUrl,
} from "./resolve_database_url.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);

let _pgPool = null;
let _logged = false;
const _clientErrorHandled = new WeakSet();

function envInt(name, fallback) {
  const n = Number(process.env[name]);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : fallback;
}

function requirePg() {
  const searchPaths = [
    path.join(__dirname, "..", "..", "apps", "backend", "node_modules"),
    path.join(__dirname, "..", "..", "node_modules"),
    path.join(__dirname, "..", "node_modules"),
  ];
  return require(require.resolve("pg", { paths: searchPaths }));
}

function attachClientErrorHandler(client) {
  if (!client || _clientErrorHandled.has(client))
    return;
  _clientErrorHandled.add(client);
  client.on("error", (err) => {
    console.warn("[db] RDS client error:", err.message);
  });
}

/** @param {string} [reason] 首次建池时的日志说明 */
export function getPgPool(reason = "") {
  const url = getResolvedDatabaseUrl();
  if (!url)
    return null;
  if (!_pgPool) {
    const { Pool } = requirePg();
    const max = envInt("DATABASE_POOL_MAX", 12);
    const connectionTimeoutMillis = envInt("DATABASE_POOL_CONNECT_TIMEOUT_MS", 10000);
    _pgPool = new Pool({ ...buildPgClientConfig(url, connectionTimeoutMillis), max });
    _pgPool.on("connect", attachClientErrorHandler);
    _pgPool.on("error", (err) => {
      console.warn("[db] RDS idle client error:", err.message);
    });
    if (!_logged) {
      _logged = true;
      const tag = reason ? ` (${reason})` : "";
      console.log(`[db] RDS 连接池已就绪${tag} max=${max} connectTimeout=${connectionTimeoutMillis}ms`);
    }
  }
  return _pgPool;
}

/** 启动前解析内网/外网 DATABASE_URL（start-db 等入口调用） */
export async function ensurePgPoolReady() {
  await initDatabaseUrl();
  return getPgPool();
}
