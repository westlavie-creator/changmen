#!/usr/bin/env node

/**
 * npm run web 启动前钩子：默认构建 Vue 控制台（托管在 /）。
 *
 * 环境变量：
 *   SKIP_APP_BUILD=1   跳过构建（仅调试 API / 代理，前端可能 404）
 *   PATCH_CONSOLE=1    额外执行 patch-ui-bundle，生成旧版 /console/（默认不再执行）
 *
 * 日常开发推荐 dev.bat（Windows 后端 3560 + Vite 5174），无需每次 prebuild。
 */

import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, "..", "..");
const BACKEND_ROOT = path.join(__dirname, "..");

function run(cmd, args, opts = {}) {
  const r = spawnSync(cmd, args, {
    cwd: opts.cwd || ROOT,
    stdio: "inherit",
    shell: process.platform === "win32",
    env: process.env,
  });
  if (r.status !== 0) {
    process.exit(r.status ?? 1);
  }
}

if (process.env.SKIP_APP_BUILD === "1") {
  console.log("[preweb] SKIP_APP_BUILD=1，跳过 app:build");
} else {
  console.log("[preweb] 构建新控制台 gamebet_frontend → / …");
  run("npm", ["run", "app:build"], { cwd: ROOT });
}

if (process.env.PATCH_CONSOLE === "1") {
  console.log("[preweb] PATCH_CONSOLE=1，patch 旧 bundle → /console/ …");
  run("npm", ["run", "patch:ui"], { cwd: ROOT });
}

const routerTs = path.join(BACKEND_ROOT, "core/esport-api/router.ts");
const routerJs = path.join(BACKEND_ROOT, "core/esport-api/router.js");
const routerStale =
  !fs.existsSync(routerJs) ||
  fs.statSync(routerTs).mtimeMs > fs.statSync(routerJs).mtimeMs;

if (routerStale) {
  console.log("[preweb] router.ts 较新，编译 router.js …");
  run("npm", ["run", "compile:router"], { cwd: BACKEND_ROOT });
}
