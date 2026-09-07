#!/usr/bin/env node

/**
 * npm run web 启动前钩子：默认构建 Vue 控制台（托管在 /）。
 *
 * 环境变量：
 *   SKIP_APP_BUILD=1   跳过构建（仅调试 API / 代理，前端可能 404）
 *   FORCE_APP_BUILD=1  turbo run dev 时仍打生产包（默认跳过）
 *
 * 日常开发推荐 BAT\dev.bat（Win: backend 3700 + Vite 5274），无需每次 prebuild。
 * `turbo run dev` / `npm run dev` 会并行起 Vite；再 app:build 会在 Windows 上
 * 抢写 client/web/components.d.ts（EUNKNOWN / errno -4094）。
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

const skipAppBuild = process.env.SKIP_APP_BUILD === "1"
  || (Boolean(process.env.TURBO_HASH) && process.env.FORCE_APP_BUILD !== "1");

if (skipAppBuild) {
  console.log("[preweb] 跳过 app:build（Vite/turbo dev 已提供前端；FORCE_APP_BUILD=1 可强制构建）");
}
else {
  console.log("[preweb] 构建新控制台 client/web → / …");
  run("npm", ["run", "app:build"], { cwd: ROOT });
}

ensureRouterCompiled({ label: "preweb" });
