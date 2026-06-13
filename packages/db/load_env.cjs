"use strict";

/**
 * CJS 入口：在创建 pg 客户端之前加载 apps/backend/.env。
 */
const fs = require("node:fs");
const path = require("node:path");
const dotenv = require("dotenv");
const { findChangmenRoot } = require("./changmen_root.cjs");

const changmenRoot = findChangmenRoot(__dirname);

for (const rel of ["apps/backend/.env"]) {
  const envPath = path.join(changmenRoot, rel);
  if (!fs.existsSync(envPath)) continue;
  dotenv.config({ path: envPath });
  if (
    process.env.DATABASE_URL ||
    process.env.DATABASE_URL_PUBLIC ||
    process.env.DATABASE_URL_INTERNAL
  ) {
    break;
  }
}
