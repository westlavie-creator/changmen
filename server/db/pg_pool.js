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

function requirePg() {
  const searchPaths = [
    path.join(__dirname, "..", "..", "apps", "backend", "node_modules"),
    path.join(__dirname, "..", "..", "node_modules"),
    path.join(__dirname, "..", "node_modules"),
  ];
  return require(require.resolve("pg", { paths: searchPaths }));
}

/** @param {string} [reason] 首次建池时的日志说明 */
export function getPgPool(reason = "") {
  const url = getResolvedDatabaseUrl();
  if (!url) return null;
  if (!_pgPool) {
    const { Pool } = requirePg();
    _pgPool = new Pool({ ...buildPgClientConfig(url), max: 4 });
    if (!_logged) {
      _logged = true;
      const tag = reason ? ` (${reason})` : "";
      console.log(`[db] RDS 连接池已就绪${tag}`);
    }
  }
  return _pgPool;
}

/** 启动前解析内网/外网 DATABASE_URL（start-db 等入口调用） */
export async function ensurePgPoolReady() {
  await initDatabaseUrl();
  return getPgPool();
}
