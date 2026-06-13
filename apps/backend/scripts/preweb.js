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
import path from "node:path";
import { fileURLToPath } from "node:url";
import { ensureRouterCompiled } from "./ensure-router-compiled.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, "..", "..", "..");

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
  console.log("[preweb] 构建新控制台 apps/web → / …");
  run("npm", ["run", "app:build"], { cwd: ROOT });
}

if (process.env.PATCH_CONSOLE === "1") {
  console.log("[preweb] PATCH_CONSOLE=1，patch 旧 bundle → /console/ …");
  run("npm", ["run", "patch:ui"], { cwd: ROOT });
}

ensureRouterCompiled({ label: "preweb" });
