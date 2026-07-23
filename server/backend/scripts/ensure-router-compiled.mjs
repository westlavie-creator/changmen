#!/usr/bin/env node
/**
 * router.js / admin_routes.js 由 tsc 编译且不入库；生产 pm2 直启 start-db.mjs 时需保证与 .ts 同步。
 */
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const BACKEND_ROOT = path.join(__dirname, "..");
const ESPORT_API = path.join(BACKEND_ROOT, "core/esport-api");

const COMPILED_PAIRS = [
  ["router.ts", "router.js"],
  ["admin_routes.ts", "admin_routes.js"],
];

function pairIsStale(tsName, jsName) {
  const tsPath = path.join(ESPORT_API, tsName);
  const jsPath = path.join(ESPORT_API, jsName);
  if (!fs.existsSync(tsPath))
    return false;
  return (
    !fs.existsSync(jsPath)
    || fs.statSync(tsPath).mtimeMs > fs.statSync(jsPath).mtimeMs
  );
}

export function routerJsIsStale() {
  return COMPILED_PAIRS.some(([ts, js]) => pairIsStale(ts, js));
}

export function ensureRouterCompiled({ label = "ensure-router" } = {}) {
  if (!routerJsIsStale())
    return true;

  console.log(`[${label}] esport-api .ts 较新，运行 compile:router …`);
  const r = spawnSync("npm", ["run", "compile:router"], {
    cwd: BACKEND_ROOT,
    stdio: "inherit",
    shell: process.platform === "win32",
    env: process.env,
  });
  if (r.status !== 0) {
    process.exit(r.status ?? 1);
  }
  return true;
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  ensureRouterCompiled();
}
