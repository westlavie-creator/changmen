"use strict";

/**
 * 加载 changmen/apps/backend/.env（team-resolver 脚本与 CJS 入口用）。
 * ESM 侧优先 import "@changmen/db/load_env.js"。
 */
require("@changmen/db/load_env.cjs");
