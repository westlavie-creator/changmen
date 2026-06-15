"use strict";

/**
 * 加载 changmen/server/backend/.env（team-resolver 脚本与 CJS 入口用）。
 * ESM 侧使用 `@changmen/db` 或 `loadChangmenEnv()`。
 */
require("@changmen/db/load_env.cjs");
