"use strict";

/**
 * 加载 changmen/apps/backend/.env（team-resolver 脚本与 CJS 入口用）。
 * ESM 侧优先 import "@changmen/db/load_env.js"。
 */
const fs = require("node:fs");
const path = require("node:path");
const dotenv = require("dotenv");

const changmenRoot = path.join(__dirname, "../../..");
const envPath = path.join(changmenRoot, "apps/backend/.env");
if (fs.existsSync(envPath)) {
  dotenv.config({ path: envPath });
}
