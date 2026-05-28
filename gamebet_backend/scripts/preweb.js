#!/usr/bin/env node
"use strict";

/**
 * npm run web 启动前钩子（阶段 7：默认构建 Vue 控制台 /app/）。
 *
 * 环境变量：
 *   SKIP_APP_BUILD=1   跳过构建（仅调试 API / 代理，/app/ 可能 404）
 *   PATCH_CONSOLE=1    额外执行 patch-ui-bundle，生成旧版 /console/（默认不再执行）
 *
 * 日常开发推荐 dev.bat（3456 后端 + 5174 Vite），无需每次 prebuild。
 */

const { spawnSync } = require("child_process");
const path = require("path");

const ROOT = path.join(__dirname, "..", "..");

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
  console.log("[preweb] 构建新控制台 gamebet_frontend/app → /app/ …");
  run("npm", ["run", "app:build"], { cwd: ROOT });
}

if (process.env.PATCH_CONSOLE === "1") {
  console.log("[preweb] PATCH_CONSOLE=1，patch 旧 bundle → /console/ …");
  run("npm", ["run", "patch:ui"], { cwd: ROOT });
}
