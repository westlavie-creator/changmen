"use strict";

/**
 * 统一加载 matcher 环境变量：本目录 .env → gamebet_backend/.env
 * 须在 require shared/db 之前调用。
 */

const path = require("path");

const MATCHER_ROOT = path.join(__dirname, "..");

require("dotenv").config({ path: path.join(MATCHER_ROOT, ".env") });
if (!process.env.SUPABASE_URL) {
  require("dotenv").config({ path: path.join(MATCHER_ROOT, "../gamebet_backend/.env") });
}

module.exports = { MATCHER_ROOT };
