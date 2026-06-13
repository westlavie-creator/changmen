/**
 * RDS 连接池（impl_rds / team_store 共用）。
 */

import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

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
  const url = process.env.DATABASE_URL;
  if (!url) return null;
  if (!_pgPool) {
    const { Pool } = requirePg();
    _pgPool = new Pool({ connectionString: url, max: 4 });
    if (! _logged) {
      _logged = true;
      const tag = reason ? ` (${reason})` : "";
      console.log(`[db] RDS 连接池已就绪${tag}`);
    }
  }
  return _pgPool;
}
