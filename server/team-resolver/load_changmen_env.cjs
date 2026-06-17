"use strict";

/**
 * team-resolver CJS 脚本用：加载 server/backend/.env。
 * ESM 侧用 `@changmen/db/load_env.js`（阶段 2 迁 team-resolver 后可删）。
 */
const fs = require("node:fs");
const path = require("node:path");
const dotenv = require("dotenv");

function findChangmenRoot(fromDir) {
  let cur = fromDir;
  for (let i = 0; i < 12; i++) {
    const backendPkg = path.join(cur, "server/backend/package.json");
    if (fs.existsSync(backendPkg)) {
      try {
        const pkg = JSON.parse(fs.readFileSync(backendPkg, "utf8"));
        if (pkg.name === "@changmen/backend") return cur;
      } catch {
        /* ignore */
      }
    }
    const parent = path.dirname(cur);
    if (parent === cur) break;
    cur = parent;
  }
  return path.resolve(fromDir, "..");
}

function hasDatabaseUrl() {
  return !!(
    process.env.DATABASE_URL ||
    process.env.DATABASE_URL_PUBLIC ||
    process.env.DATABASE_URL_INTERNAL
  );
}

function loadChangmenEnv() {
  const changmenRoot = findChangmenRoot(__dirname);
  const envPath = path.join(changmenRoot, "server/backend/.env");
  if (fs.existsSync(envPath)) {
    dotenv.config({ path: envPath });
    if (hasDatabaseUrl()) return;
  }
}

loadChangmenEnv();
