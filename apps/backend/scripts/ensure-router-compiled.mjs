#!/usr/bin/env node
/**
 * router.js 由 router.ts 编译且不入库；生产 pm2 直启 start-db.mjs 时需保证二者同步。
 */
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const BACKEND_ROOT = path.join(__dirname, "..");
const routerTs = path.join(BACKEND_ROOT, "core/esport-api/router.ts");
const routerJs = path.join(BACKEND_ROOT, "core/esport-api/router.js");

export function routerJsIsStale() {
  return (
    !fs.existsSync(routerJs) ||
    fs.statSync(routerTs).mtimeMs > fs.statSync(routerJs).mtimeMs
  );
}

export function ensureRouterCompiled({ label = "ensure-router" } = {}) {
  if (!routerJsIsStale()) return true;

  console.log(`[${label}] router.ts 较新，编译 router.js …`);
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
